import os
import json
import asyncio
import logging
from typing import Literal
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from services.security import validate_url, SecurityValidationError, sanitize_filename
from services.youtube import is_valid_supported_url, extract_video_info, SanitizedYTDLPLogger, MediaProviderRateLimitError, get_impersonate_target
from services.job_manager import job_manager, QueueFullError, DOWNLOADS_DIR
from services.rate_limiter import inspect_limiter, job_limiter

logger = logging.getLogger("vydrivo.api")
router = APIRouter()

class InspectRequest(BaseModel):
    url: str = Field(..., min_length=10, max_length=2048)

class CreateJobRequest(BaseModel):
    url: str = Field(..., min_length=10, max_length=2048)
    format: Literal["video", "audio", "image"]
    quality: str = Field(..., min_length=1, max_length=32)

def get_client_ip(request: Request) -> str:
    """Extracts client IP, respecting X-Forwarded-For if behind a proxy."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

@router.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "vydrivo-media-engine",
        "version": "1.0.3",
        "player_client": "web_embedded",
        "tls_impersonate": bool(get_impersonate_target())
    }

@router.post("/inspect")
def inspect_video(req: InspectRequest, request: Request):
    client_ip = get_client_ip(request)
    
    # 1. Rate Limiting Check
    allowed, retry_after = inspect_limiter.is_allowed(client_ip)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Please wait {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)}
        )

    # 2. Security & SSRF URL Validation
    raw_url = req.url.strip()
    try:
        validated_url = validate_url(raw_url, require_dns_check=True)
    except SecurityValidationError as e:
        logger.warning("SSRF / URL validation rejected '%s' from IP %s: %s", raw_url, client_ip, e)
        raise HTTPException(status_code=400, detail="Invalid or unsupported URL. Please provide a valid public HTTPS link.")

    if not is_valid_supported_url(validated_url):
        raise HTTPException(
            status_code=400,
            detail="Unsupported link. Vydrivo currently supports YouTube, Instagram, Facebook, and Pinterest."
        )

    # 3. Media Metadata Extraction
    try:
        info = extract_video_info(validated_url)
        if not info:
            raise Exception("No media metadata was returned by the extractor.")
        return {"success": True, "data": info}
    except MediaProviderRateLimitError as rle:
        logger.warning("Upstream rate limit from IP %s: %s", client_ip, rle)
        raise HTTPException(
            status_code=429,
            detail="The media provider is currently rate-limiting requests. Please try again in a few minutes."
        )
    except Exception as e:
        err_msg = str(e)
        sanitized_diag = SanitizedYTDLPLogger.sanitize_message(err_msg)
        logger.error("Inspection error from IP %s: %s", client_ip, sanitized_diag)

        if "429" in err_msg or "Too Many Requests" in err_msg:
            raise HTTPException(
                status_code=429,
                detail="The media provider is currently rate-limiting requests. Please try again in a few minutes."
            )

        # Sanitized error message without leaking internal tracebacks
        raise HTTPException(
            status_code=500,
            detail="Unable to fetch media details. The link may be private, age-restricted, or temporarily unavailable."
        )

@router.post("/jobs")
def create_job(req: CreateJobRequest, request: Request):
    client_ip = get_client_ip(request)

    # 1. Rate Limiting Check
    allowed, retry_after = job_limiter.is_allowed(client_ip)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Download creation rate limit exceeded. Please wait {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)}
        )

    # 2. Security & SSRF URL Validation
    raw_url = req.url.strip()
    try:
        validated_url = validate_url(raw_url, require_dns_check=True)
    except SecurityValidationError as e:
        logger.warning("Job creation rejected invalid URL '%s' from IP %s: %s", raw_url, client_ip, e)
        raise HTTPException(status_code=400, detail="Invalid or unsupported URL.")

    if not is_valid_supported_url(validated_url):
        raise HTTPException(status_code=400, detail="Invalid YouTube, Instagram, Facebook, or Pinterest link.")

    # 3. Create Download Job
    try:
        job = job_manager.create_job(url=validated_url, format_type=req.format, quality=req.quality)
        return {"success": True, "job_id": job.job_id, "status": job.status}
    except QueueFullError as qe:
        raise HTTPException(status_code=503, detail=str(qe))
    except Exception as e:
        logger.error("Failed to create job for URL '%s': %s", validated_url, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to initialize download job.")

@router.get("/jobs/{job_id}")
def get_job_status(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or has expired.")
    return job.to_dict()

@router.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: str):
    cancelled = job_manager.cancel_job(job_id)
    if not cancelled:
        raise HTTPException(status_code=404, detail="Job not found or already finished.")
    return {"success": True, "message": "Job cancelled."}

@router.get("/jobs/{job_id}/events")
async def stream_job_events(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or has expired.")

    async def event_generator():
        last_progress = -1.0
        last_status = ""
        last_speed = ""
        start_time = asyncio.get_event_loop().time()
        last_ping = start_time

        while True:
            current = job.to_dict()
            cur_progress = current.get("progress", 0.0)
            cur_status = current.get("status", "")
            cur_speed = current.get("speed", "")
            now = asyncio.get_event_loop().time()

            # Send update if state changed
            if cur_progress != last_progress or cur_status != last_status or cur_speed != last_speed:
                last_progress = cur_progress
                last_status = cur_status
                last_speed = cur_speed
                yield {"data": json.dumps(current)}
            elif now - last_ping > 15:
                # Send periodic SSE keep-alive heartbeat comment
                last_ping = now
                yield {"comment": "ping"}

            # Terminal states
            if cur_status in ("completed", "failed", "cancelled"):
                break

            # Enforce 10-minute maximum stream lifetime
            if now - start_time > 600:
                logger.info("SSE stream timed out after 600s for job %s", job_id)
                break

            await asyncio.sleep(0.3)

    return EventSourceResponse(event_generator())

@router.api_route("/jobs/{job_id}/download", methods=["GET", "HEAD"])
def download_file(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or has expired.")

    if job.status != "completed" or not job.file_path:
        raise HTTPException(status_code=400, detail="File is not ready for download.")

    # Path traversal protection: Ensure target is strictly within DOWNLOADS_DIR
    real_downloads_dir = os.path.realpath(DOWNLOADS_DIR)
    real_file_path = os.path.realpath(job.file_path)
    if not real_file_path.startswith(real_downloads_dir):
        logger.error("Path traversal attempt detected on job %s: path=%s", job_id, job.file_path)
        raise HTTPException(status_code=403, detail="Access denied.")

    if not os.path.isfile(real_file_path):
        raise HTTPException(status_code=404, detail="Download file no longer exists.")

    # Accurate MIME type detection based on actual file extension
    ext = os.path.splitext(real_file_path)[1].lower().strip(".")
    mime_map = {
        "mp4": "video/mp4",
        "webm": "video/webm" if job.format_type != "audio" else "audio/webm",
        "mp3": "audio/mpeg",
        "m4a": "audio/mp4",
        "wav": "audio/wav",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
    }
    media_type = mime_map.get(ext, "application/octet-stream")

    # Sanitize download filename for RFC 5987 Unicode header safety
    import urllib.parse
    import re

    clean_filename = sanitize_filename(job.filename)
    ascii_filename = re.sub(r'[^\x20-\x7E]', '_', clean_filename)
    if not ascii_filename.strip():
        ascii_filename = f"media_file.{ext}"

    encoded_filename = urllib.parse.quote(clean_filename)
    content_disposition = f'attachment; filename="{ascii_filename}"; filename*=UTF-8\'\'{encoded_filename}'

    return FileResponse(
        path=real_file_path,
        media_type=media_type,
        headers={"Content-Disposition": content_disposition}
    )
