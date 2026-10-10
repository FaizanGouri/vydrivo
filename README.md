# VYDRIVO – Modern YouTube & Shorts Video Downloader

<p align="center">
  <b>A sleek, high-performance web application to inspect and download YouTube videos & Shorts in high quality (1080p Full HD, 720p HD, 480p) or extract crystal-clear MP3 audio with real-time SSE progress streaming.</b>
</p>

---

## 🌟 Highlights & Features

- **Full-Screen Forest Green Aesthetic**: Clean, responsive, and immersive edge-to-edge design.
- **Dynamic Preloader Animation**: Multi-platform logo gathering (YouTube, Instagram, Pinterest, Facebook) with fluid color mixing and animated **VYDRIVO** letter formation.
- **Continuous Floating Levitation**: Smooth floating animation for the big background watermark and verified counter badge.
- **Universal YouTube Support**: Works seamlessly with regular YouTube videos (`youtube.com/watch?v=...`) and vertical Shorts (`youtube.com/shorts/...`).
- **Lossless Stream Merging via FFmpeg**: High-resolution video tracks (1080p, 720p) are merged with audio streams losslessly into standard MP4.
- **High-Bitrate MP3 Extraction**: Extract audio directly to MP3 (up to 320 kbps).
- **Accurate Real-Time Progress**: Powered by Server-Sent Events (SSE) reporting real download percentage, speed, and ETA.
- **Zero Fabrication**: Only genuine backend progress and verified streams are shown.
- **Self-Cleaning Storage**: Background worker periodically deletes temporary files older than 30 minutes to manage disk space.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, React 19)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Typography**: [Outfit](https://fonts.google.com/specimen/Outfit) via Google Fonts
- **Icons**: [Lucide React](https://lucide.dev/)
- **Language**: TypeScript

### Backend
- **Framework**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.12+)
- **Extraction Engine**: [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- **Media Transcoder**: [FFmpeg 9.0+](https://ffmpeg.org/)
- **Live Updates**: Server-Sent Events ([sse-starlette](https://github.com/sysid/sse-starlette))
- **ASGI Server**: [Uvicorn](https://www.uvicorn.org/)

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** (v18+)
- **Python** (v3.10+)
- **FFmpeg** installed and accessible in your system `PATH` (e.g., via `winget install Gyan.FFmpeg` on Windows, `brew install ffmpeg` on macOS, or `apt install ffmpeg` on Linux).

---

### 2. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create and activate Python virtual environment
python -m venv venv

# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install backend dependencies
pip install -r requirements.txt

# Start the FastAPI server
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
The backend API will be live at `http://127.0.0.1:8000`.

---

### 3. Frontend Setup

```bash
# In a new terminal, navigate to frontend directory
cd frontend

# Install npm dependencies
npm install

# Start Next.js development server
npm run dev
```

Open your browser and navigate to:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 📡 API Endpoints Overview

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/health` | Service health status |
| `POST` | `/api/v1/inspect` | Inspect YouTube/Shorts URL, returns title, thumbnail, duration, view count, and available stream qualities |
| `POST` | `/api/v1/jobs` | Initializes a media download/conversion job |
| `GET` | `/api/v1/jobs/{job_id}` | Fetch current job status and progress |
| `GET` | `/api/v1/jobs/{job_id}/events` | Real-time Server-Sent Events (SSE) progress stream |
| `GET` | `/api/v1/jobs/{job_id}/download` | Secure file delivery with RFC 5987 Unicode filename headers |

---

## 🔒 Security & Privacy

- **No Personal Information Stored**: Downloads directory is ignored by Git; no user credentials or logs are tracked.
- **SSRF & Network Hardening**: Strict YouTube URL regex verification prevents internal network probing.
- **RFC 5987 Compliant Filename Encoding**: Protects download headers against emoji and international Unicode character encoding crashes.
- **Automatic TTL Deletion**: Temporary converted files expire and are purged automatically.

---

## 📄 License

This project is open-source and intended for personal educational media management.
