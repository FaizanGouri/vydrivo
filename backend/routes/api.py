import json
import asyncio
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel, HttpUrl
from sse_starlette.sse import EventSourceResponse

from services.youtube import is_valid_youtube_url, extract_video_info
from services.job_manager import job_manager

router = APIRouter()

class InspectRequest(BaseModel):
    url: str

class CreateJobRequest(BaseModel):
    url: str
    format: str  # 'video' or 'audio'
    quality: str # '1080p', '720p', '320kbps', etc.

@router.get("/health")
def health_check():
    return {"status": "ok", "service": "video-downloader-backend"}

@router.post("/inspect")
def inspect_video(req: InspectRequest):
    url = req.url.strip()
    if not is_valid_youtube_url(url):
        raise HTTPException(status_code=400, detail="Invalid YouTube video or Shorts URL. Please provide a valid YouTube link.")

    try:
        info = extract_video_info(url)
        return {"success": True, "data": info}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch video details: {str(e)}")

@router.post("/jobs")
def create_job(req: CreateJobRequest):
    url = req.url.strip()
    if not is_valid_youtube_url(url):
        raise HTTPException(status_code=400, detail="Invalid YouTube URL.")

    job = job_manager.create_job(url=url, format_type=req.format, quality=req.quality)
    return {"success": True, "job_id": job.job_id, "status": job.status}

@router.get("/jobs/{job_id}")
def get_job_status(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or expired.")
    return job.to_dict()

@router.get("/jobs/{job_id}/events")
async def stream_job_events(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or expired.")

    queue = asyncio.Queue()
    job.subscribers.append(queue)

    async def event_generator():
        # First send current state immediately
        yield {"data": json.dumps(job.to_dict())}
        try:
            while True:
                if job.status in ["completed", "failed", "cancelled"]:
                    break
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield {"data": json.dumps(data)}
                    if data.get("status") in ["completed", "failed", "cancelled"]:
                        break
                except asyncio.TimeoutError:
                    # Heartbeat
                    yield {"event": "ping", "data": "keep-alive"}
        finally:
            if queue in job.subscribers:
                job.subscribers.remove(queue)

    return EventSourceResponse(event_generator())

@router.get("/jobs/{job_id}/download")
def download_file(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or has expired.")

    if job.status != "completed" or not job.file_path:
        raise HTTPException(status_code=400, detail="File is not ready for download.")

    media_type = "audio/mpeg" if job.format_type == "audio" else "video/mp4"
    
    # Sanitize filename for HTTP header (RFC 5987 / Latin-1 safe ASCII fallback + UTF-8 filename*)
    import urllib.parse
    import re

    # ASCII-only fallback filename
    ascii_filename = re.sub(r'[^\x20-\x7E]', '_', job.filename)
    if not ascii_filename.strip():
        ascii_filename = f"video.{'mp3' if job.format_type == 'audio' else 'mp4'}"
    
    encoded_filename = urllib.parse.quote(job.filename)
    content_disposition = f'attachment; filename="{ascii_filename}"; filename*=UTF-8\'\'{encoded_filename}'

    return FileResponse(
        path=job.file_path,
        media_type=media_type,
        headers={"Content-Disposition": content_disposition}
    )
