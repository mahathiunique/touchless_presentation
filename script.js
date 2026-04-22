/**
 * Touchless Presentation Controller
 * ----------------------------------
 * Gesture-based slide control using MediaPipe Hands.
 *
 * Gesture priority:
 *   0. Pause (open palm held 1s) → Pointer only, no swipe/zoom
 *   1. Pinch (thumb + index close) → Zoom
 *   2. Fast horizontal hand sweep   → Swipe (next / prev slide)
 *   3. Default                      → Pointer
 */

// ─── Slide Data ──────────────────────────────────────────────
const slides = ['DAY2/1.png', 'DAY2/2.png', 'DAY2/3.png'];
let currentSlideIndex = 0;

// ─── DOM Elements ────────────────────────────────────────────
const slideContainer = document.getElementById('slide-container');
const currentSlide   = document.getElementById('current-slide');
const webcamCanvas   = document.getElementById('webcam-canvas');
const pointer        = document.getElementById('pointer');
const gestureBadge   = document.getElementById('gesture-badge');
const gestureIcon    = document.getElementById('gesture-icon');
const gestureLabel   = document.getElementById('gesture-label');
const slideCounter   = document.getElementById('slide-counter');
const navHintLeft    = document.getElementById('nav-hint-left');
const navHintRight   = document.getElementById('nav-hint-right');

// ─── Pointer State ───────────────────────────────────────────
let pointerX = 0;
let pointerY = 0;
let targetX  = 0;
let targetY  = 0;
const POINTER_SMOOTH = 0.3; // lerp factor — higher = faster response

// ─── Gesture State ───────────────────────────────────────────
let activeGesture    = 'none'; // 'pointer' | 'zoom' | 'swipe' | 'pause' | 'none'
let isHandDetected   = false;

// ─── Pause State ─────────────────────────────────────────────
let isPaused             = false;  // true once pause is confirmed (held 1s)
let pauseStartTime       = null;   // when open-palm was first detected
let pauseAnchorX         = null;   // palm position when pause detection started
let pauseAnchorY         = null;
const PAUSE_HOLD_MS      = 1000;   // must hold open palm this long to activate
const PAUSE_MOVE_THRESH  = 0.04;   // palm movement beyond this cancels pause detection
const PAUSE_EXIT_THRESH  = 0.07;   // large deliberate move to exit pause mode

// ─── Swipe State ─────────────────────────────────────────────
let swipeTrackX      = null;   // X position when horizontal tracking started
let swipeTrackY      = null;
let swipeCooldown    = false;
const SWIPE_THRESHOLD    = 0.10;  // min horizontal delta to trigger
const SWIPE_COOLDOWN_MS  = 800;

// ─── Zoom State ──────────────────────────────────────────────
let zoomScale        = 1;
let targetZoom       = 1;
let prevPinchDist    = null;
const ZOOM_MIN       = 0.7;
const ZOOM_MAX       = 2.5;
const PINCH_THRESHOLD = 0.12; // distance under which = pinch
const ZOOM_SMOOTH    = 0.15;
const ZOOM_DEAD_ZONE = 0.012; // ignore tiny fluctuations

// ─── RAF ─────────────────────────────────────────────────────
let rafId = null;

// ═══════════════════════════════════════════════════════════════
//  MEDIAPIPE SETUP
// ═══════════════════════════════════════════════════════════════

const videoElement = document.createElement('video');
videoElement.style.display = 'none';
document.body.appendChild(videoElement);

const hands = new Hands({
    locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
});

hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
});

hands.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
    },
    width: 640,
    height: 480,
});

camera.start()
    .then(() => {
        startRenderLoop();
    })
    .catch(() => {
        alert('Camera access denied. Please allow camera permissions and reload.');
    });

// ═══════════════════════════════════════════════════════════════
//  MEDIAPIPE CALLBACK — data only, NO DOM writes
// ═══════════════════════════════════════════════════════════════

function onResults(results) {
    // Draw webcam + hand skeleton
    const ctx = webcamCanvas.getContext('2d');
    ctx.save();
    ctx.clearRect(0, 0, webcamCanvas.width, webcamCanvas.height);
    ctx.drawImage(results.image, 0, 0, webcamCanvas.width, webcamCanvas.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const lm = results.multiHandLandmarks[0];

        drawConnectors(ctx, lm, HAND_CONNECTIONS, { color: '#6366f1', lineWidth: 3 });
        drawLandmarks(ctx, lm, { color: '#f43f5e', lineWidth: 1, radius: 3 });

        isHandDetected = true;
        processGestures(lm);
    } else {
        isHandDetected = false;
        activeGesture  = 'none';
        swipeTrackX    = null;
        swipeTrackY    = null;
        prevPinchDist  = null;
        // Reset pause detection when hand disappears
        pauseStartTime = null;
        pauseAnchorX   = null;
        pauseAnchorY   = null;
        isPaused       = false;
    }

    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  GESTURE LOGIC  — priority: pause → pinch → swipe → pointer
// ═══════════════════════════════════════════════════════════════

function processGestures(lm) {
    const thumb = lm[4];
    const index = lm[8];
    const palm  = lm[9]; // middle of palm — good for swipe

    // 0) Pause detection & handling (highest priority)
    const palmOpen = isOpenPalm(lm);

    if (isPaused) {
        // ── Currently paused ──
        // Check if user wants to EXIT pause (large deliberate movement or closed hand)
        if (!palmOpen) {
            // Hand closed → exit pause
            isPaused = false;
            pauseStartTime = null;
            pauseAnchorX = null;
            pauseAnchorY = null;
        } else if (pauseAnchorX !== null) {
            const moveDist = Math.hypot(palm.x - pauseAnchorX, palm.y - pauseAnchorY);
            if (moveDist > PAUSE_EXIT_THRESH) {
                // Large deliberate move → exit pause
                isPaused = false;
                pauseStartTime = null;
                pauseAnchorX = null;
                pauseAnchorY = null;
            }
        }

        if (isPaused) {
            // Still paused → pointer only, block everything else
            activeGesture = 'pause';
            targetX = index.x * window.innerWidth;
            targetY = index.y * window.innerHeight;
            // Reset swipe/zoom trackers so they don't fire on unpause
            swipeTrackX = null;
            swipeTrackY = null;
            prevPinchDist = null;
            return;
        }
    }

    // ── Pause detection (not yet paused) ──
    if (palmOpen) {
        if (pauseStartTime === null) {
            // Start tracking open palm
            pauseStartTime = Date.now();
            pauseAnchorX = palm.x;
            pauseAnchorY = palm.y;
        } else {
            // Check if hand moved too much during detection window
            const moveDist = Math.hypot(palm.x - pauseAnchorX, palm.y - pauseAnchorY);
            if (moveDist > PAUSE_MOVE_THRESH) {
                // Too much movement — restart detection
                pauseStartTime = Date.now();
                pauseAnchorX = palm.x;
                pauseAnchorY = palm.y;
            } else if (Date.now() - pauseStartTime >= PAUSE_HOLD_MS) {
                // Held steady for 1 second → activate pause!
                isPaused = true;
                activeGesture = 'pause';
                targetX = index.x * window.innerWidth;
                targetY = index.y * window.innerHeight;
                swipeTrackX = null;
                swipeTrackY = null;
                prevPinchDist = null;
                return;
            }
        }
    } else {
        // Not open palm → reset detection timer
        pauseStartTime = null;
        pauseAnchorX = null;
        pauseAnchorY = null;
    }

    // 1) Pinch detection
    const pinchDist = dist2D(thumb, index);

    if (pinchDist < PINCH_THRESHOLD) {
        activeGesture = 'zoom';
        handleZoom(pinchDist);
        // Reset swipe tracker when zooming
        swipeTrackX = null;
        swipeTrackY = null;
        return;
    }

    // Not pinching — reset zoom tracking
    prevPinchDist = null;

    // 2) Swipe detection (only when not zooming)
    if (!swipeCooldown) {
        if (handleSwipe(palm)) {
            activeGesture = 'swipe';
            return;
        }
    }

    // 3) Default → pointer
    activeGesture = 'pointer';
    targetX = index.x * window.innerWidth;
    targetY = index.y * window.innerHeight;
}

// ─── Open Palm Detection ─────────────────────────────────────

function isOpenPalm(lm) {
    // All 5 fingertips must be above their PIP/IP joints (extended)
    const thumbUp  = lm[4].y < lm[3].y;
    const indexUp  = lm[8].y < lm[6].y;
    const middleUp = lm[12].y < lm[10].y;
    const ringUp   = lm[16].y < lm[14].y;
    const pinkyUp  = lm[20].y < lm[18].y;
    return thumbUp && indexUp && middleUp && ringUp && pinkyUp;
}

// ─── Zoom Handler ────────────────────────────────────────────

function handleZoom(pinchDist) {
    if (prevPinchDist === null) {
        prevPinchDist = pinchDist;
        return;
    }

    const delta = pinchDist - prevPinchDist;

    // Dead-zone to suppress jitter
    if (Math.abs(delta) < ZOOM_DEAD_ZONE) return;

    // Map distance to scale
    const minD = 0.03;
    const maxD = 0.28;
    const clamped = clamp(pinchDist, minD, maxD);
    const t = (clamped - minD) / (maxD - minD);
    targetZoom = ZOOM_MIN + t * (ZOOM_MAX - ZOOM_MIN);

    prevPinchDist = pinchDist;
}

// ─── Swipe Handler ───────────────────────────────────────────

function handleSwipe(palm) {
    const cx = palm.x;
    const cy = palm.y;

    if (swipeTrackX === null) {
        swipeTrackX = cx;
        swipeTrackY = cy;
        return false;
    }

    const dx = cx - swipeTrackX;
    const dy = cy - swipeTrackY;

    // Must be mostly horizontal
    if (Math.abs(dy) > Math.abs(dx) * 0.6) {
        // Too vertical — reset
        swipeTrackX = cx;
        swipeTrackY = cy;
        return false;
    }

    if (Math.abs(dx) > SWIPE_THRESHOLD) {
        // Swipe detected!
        if (dx > 0) {
            nextSlide();
            flashNavHint('right');
        } else {
            prevSlide();
            flashNavHint('left');
        }

        // Cooldown
        swipeCooldown = true;
        swipeTrackX = null;
        swipeTrackY = null;
        setTimeout(() => {
            swipeCooldown = false;
        }, SWIPE_COOLDOWN_MS);

        return true;
    }

    return false;
}

// ═══════════════════════════════════════════════════════════════
//  RENDER LOOP — all DOM updates happen here via rAF
// ═══════════════════════════════════════════════════════════════

function startRenderLoop() {
    function frame() {
        // ── Pointer (works during both 'pointer' and 'pause' gestures) ──
        if (isHandDetected && (activeGesture === 'pointer' || activeGesture === 'pause')) {
            pointerX = lerp(pointerX, targetX, POINTER_SMOOTH);
            pointerY = lerp(pointerY, targetY, POINTER_SMOOTH);

            pointer.style.transform = `translate(${pointerX}px, ${pointerY}px)`;
            pointer.style.opacity = '1';
        } else {
            pointer.style.opacity = '0';
        }

        // ── Zoom (smooth interpolation) ──
        if (activeGesture === 'zoom') {
            zoomScale = lerp(zoomScale, targetZoom, ZOOM_SMOOTH);
        } else {
            // Ease back to 1× when not zooming
            zoomScale = lerp(zoomScale, 1, 0.08);
        }
        slideContainer.style.transform = `scale(${zoomScale.toFixed(3)})`;

        // ── Gesture badge ──
        updateGestureBadge();

        rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);
}

// ═══════════════════════════════════════════════════════════════
//  SLIDE NAVIGATION
// ═══════════════════════════════════════════════════════════════

function nextSlide() {
    if (currentSlideIndex >= slides.length - 1) return;
    currentSlideIndex++;
    applySlide();
}

function prevSlide() {
    if (currentSlideIndex <= 0) return;
    currentSlideIndex--;
    applySlide();
}

function applySlide() {
    // Fade out
    currentSlide.style.opacity = '0';

    setTimeout(() => {
        currentSlide.src = slides[currentSlideIndex];
        currentSlide.alt = `Slide ${currentSlideIndex + 1}`;

        currentSlide.onerror = () => {
            currentSlide.src =
                'https://via.placeholder.com/800x600/1e293b/f1f5f9?text=Slide+Not+Found';
        };

        // Fade in
        setTimeout(() => {
            currentSlide.style.opacity = '1';
        }, 50);
    }, 200);

    // Update counter
    slideCounter.textContent = `${currentSlideIndex + 1} / ${slides.length}`;
}

// ═══════════════════════════════════════════════════════════════
//  UI HELPERS
// ═══════════════════════════════════════════════════════════════

function flashNavHint(direction) {
    const hint = direction === 'left' ? navHintLeft : navHintRight;
    hint.classList.add('show', 'pulse');
    setTimeout(() => {
        hint.classList.remove('show', 'pulse');
    }, 500);
}

function updateGestureBadge() {
    let icon, label, isActive;

    if (!isHandDetected) {
        icon = '✋'; label = 'No Hand'; isActive = false;
    } else {
        switch (activeGesture) {
            case 'pointer':
                icon = '👆'; label = 'Pointer'; isActive = true;
                break;
            case 'pause':
                icon = '⏸️'; label = 'Paused'; isActive = true;
                break;
            case 'zoom':
                icon = '🔍'; label = 'Zoom'; isActive = true;
                break;
            case 'swipe':
                icon = '👉'; label = 'Swiped!'; isActive = true;
                break;
            default:
                icon = '✋'; label = 'Waiting...'; isActive = false;
        }
    }

    gestureIcon.textContent  = icon;
    gestureLabel.textContent = label;
    gestureBadge.classList.toggle('active', isActive);
}

// ═══════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function dist2D(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

// Initialize first slide display
applySlide();