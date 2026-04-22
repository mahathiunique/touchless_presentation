# ✋ AirPresent — Touchless Presentation Controller

A browser-based **touchless presentation system** that enables users to control slides using real-time hand gestures — no mouse or keyboard required.

---

## 🎯 Motivation

I’ve wanted to build a **touchless interaction system** for a long time.
During my semester break, I finally explored this idea and built a working prototype while learning about real-time computer vision and gesture-based interfaces.

---

## ⚙️ Tech Stack

* JavaScript (Vanilla)
* MediaPipe Hands (real-time hand tracking)
* HTML5 + CSS3
* Canvas / DOM APIs

---

## 🧠 How It Works

* Hand landmarks are detected using MediaPipe Hands
* Index finger (landmark 8) is mapped to screen coordinates for a **laser pointer**
* Swipe gestures are detected using horizontal velocity + cooldown logic
* Zoom is calculated using distance between thumb (4) and index finger (8)
* Gesture logic ensures smooth switching between pointer, swipe, and zoom

---

## ✨ Features

* 👉 Swipe left/right → Navigate slides
* 🎯 Finger tracking → Laser pointer
* 🔍 Pinch gesture → Zoom in/out
* ✋ Open palm → Pause interactions
* ⚡ Smooth, low-latency real-time interaction

---

## 🧩 Challenges & Learnings

* Reducing pointer latency and jitter
* Handling gesture conflicts in real-time
* Designing a stable and responsive gesture pipeline
* Balancing smoothing vs responsiveness

---

## 📂 Project Structure

```
AirPresent/
│── index.html
│── style.css
│── script.js
│
├── assets/
│   ├── slides/
│       ├── 1.png
│       ├── 2.png
│       ├── 3.png
```

---

## 🚀 Getting Started

1. Clone the repository
2. Open the project in VS Code
3. Run using Live Server
4. Allow camera access
5. Start controlling slides with your hand

---

## 🎥 Demo

(Add your demo video / GIF here)

---

## 🔮 Future Improvements

* Multi-hand gesture support
* Gesture customization
* Integration with real PPT/PDF files
* Full gesture-based interface system (AirDesk vision)

---

## 💡 Use Cases

* Presentations without physical interaction
* Touchless systems in healthcare environments
* Interactive learning setups
* Exploration of camera-first interfaces

---

## 📌 Conclusion

This project demonstrates how **computer vision can replace traditional input systems**, opening possibilities for more natural and touchless human-computer interaction.

---

⭐ If you found this interesting, feel free to star the repo!
