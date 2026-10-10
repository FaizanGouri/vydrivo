# TubeFetch - Modern YouTube & Shorts Downloader

A full-stack, high-performance web application to inspect and download YouTube videos and Shorts in various resolutions (1080p Full HD, 720p HD, 480p, 360p) or export high-quality MP3 audio with real-time SSE progress tracking.

---

## Features

- **YouTube Videos & Shorts Support**: Seamless extraction for standard videos and vertical Shorts.
- **Multi-Format & Quality Selection**: 1080p Full HD, 720p, 480p, 360p (MP4) and 320 kbps / 128 kbps (MP3).
- **FFmpeg Integration**: Automatic lossless video + audio stream merging.
- **Real-Time Live Progress**: Real progress percentages, download speed, and ETA via Server-Sent Events (SSE).
- **Premium Charcoal Dark UI**: Clean, responsive interface built with Next.js and Tailwind CSS.
- **Automatic Storage Management**: Self-cleaning temporary storage to manage disk quotas.

---

## Tech Stack

- **Frontend**: Next.js 16 (React, TypeScript), Tailwind CSS, Lucide Icons
- **Backend**: Python 3.12+, FastAPI, Pydantic, Uvicorn, yt-dlp, FFmpeg

---

## Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Python](https://www.python.org/) (v3.10+)
- [FFmpeg](https://ffmpeg.org/) installed and available in PATH.

### 2. Backend Setup
```bash
cd backend
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## License
MIT License. Built for educational and personal media management purposes.
