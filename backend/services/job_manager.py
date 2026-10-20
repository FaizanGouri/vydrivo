import os
import sys
import uuid
import time
import shutil
import asyncio
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Any, Optional, List
import yt_dlp

from services.security import safe_http_fetch, sanitize_filename
from services.youtube import SanitizedYTDLPLogger, get_js_runtime_config

logger = logging.getLogger("vydrivo.jobs")

DOWNLOADS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "downloads"))
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

MAX_CONCURRENT_JOBS = int(os.environ.get("MAX_CONCURRENT_JOBS", "4"))
MAX_QUEUE_CAPACITY = int(os.environ.get("MAX_QUEUE_CAPACITY", "25"))
JOB_TIMEOUT_SECONDS = int(os.environ.get("JOB_TIMEOUT_SECONDS", "300")) # 5 minutes

def get_ffmpeg_path() -> Optional[str]:
    """
    Finds FFmpeg binary from environment, virtualenv Scripts,
    imageio-ffmpeg package, or system PATH.
    """
    env_path = os.environ.get("FFMPEG_PATH")
    if env_path and os.path.exists(env_path):
        return env_path

    venv_ffmpeg = os.path.join(os.path.dirname(sys.executable), "ffmpeg.exe")
    if os.path.exists(venv_ffmpeg):
        return venv_ffmpeg

    try:
        import imageio_ffmpeg
        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if exe and os.path.exists(exe):
            return exe
    except Exception:
        pass

    bin_path = shutil.which("ffmpeg")
    if bin_path:
        return bin_path

    return None

class QueueFullError(Exception):
    """Raised when the job queue is saturated."""
    pass

class Job:
    VALID_TRANSITIONS = {
        "queued": {"processing", "cancelled"},
        "processing": {"completed", "failed", "cancelled"},
        "completed": set(),
        "failed": set(),
        "cancelled": set(),
    }

    def __init__(self, job_id: str, url: str, format_type: str, quality: str):
        self.job_id = job_id
        self.url = url
        self.format_type = format_type  # 'video', 'audio', or 'image'
        self.quality = quality          # e.g., '1080p', '720p', '320kbps', 'Original'
        self.status = "queued"          # queued, processing, completed, failed, cancelled
        self.progress = 0.0
        self.speed = ""
        self.eta = ""
        self.filename = ""
        self.file_path = ""
        self.file_size = 0
        self.error: Optional[str] = None
        self.created_at = time.time()
        self.updated_at = time.time()
        self.lock = threading.Lock()
        self.is_cancelled = False

    def update_progress(self, percent: float, speed: str = "", eta: str = ""):
        with self.lock:
            if self.status != "processing":
                return
            self.progress = round(max(0.0, min(100.0, percent)), 1)
            self.speed = speed
            self.eta = eta
            self.updated_at = time.time()

    def set_status(self, new_status: str, error: Optional[str] = None) -> bool:
        with self.lock:
            allowed = self.VALID_TRANSITIONS.get(self.status, set())
            if new_status not in allowed:
                logger.warning(
                    "Ignored invalid state transition for job %s: %s -> %s",
                    self.job_id, self.status, new_status
                )
                return False

            self.status = new_status
            if error:
                self.error = error
            self.updated_at = time.time()
            return True

    def cancel(self):
        with self.lock:
            self.is_cancelled = True
            if self.status in ("queued", "processing"):
                self.status = "cancelled"
                self.error = "Job was cancelled."
                self.updated_at = time.time()

    def to_dict(self) -> Dict[str, Any]:
        with self.lock:
            return {
                "job_id": self.job_id,
                "status": self.status,
                "progress": self.progress,
                "speed": self.speed,
                "eta": self.eta,
                "filename": self.filename,
                "file_size": self.file_size,
                "error": self.error,
            }

class JobManager:
    def __init__(self):
        self.jobs: Dict[str, Job] = {}
        self.lock = threading.Lock()
        self.executor = ThreadPoolExecutor(
            max_workers=MAX_CONCURRENT_JOBS,
            thread_name_prefix="vydrivo_worker"
        )
        # Perform startup cleanup of orphaned disk files
        self._purge_stale_disk_files(max_age_seconds=1800)
        # Start periodic background cleanup worker
        threading.Thread(target=self._cleanup_loop, daemon=True).start()

    def create_job(self, url: str, format_type: str, quality: str) -> Job:
        with self.lock:
            # Check capacity
            active_count = sum(
                1 for j in self.jobs.values() if j.status in ("queued", "processing")
            )
            if active_count >= MAX_QUEUE_CAPACITY:
                raise QueueFullError("The server is currently processing maximum capacity. Please retry shortly.")

            job_id = str(uuid.uuid4())
            job = Job(job_id, url, format_type, quality)
            self.jobs[job_id] = job

        # Submit task to bounded thread pool
        self.executor.submit(self._run_job_wrapper, job)
        return job

    def get_job(self, job_id: str) -> Optional[Job]:
        with self.lock:
            return self.jobs.get(job_id)

    def cancel_job(self, job_id: str) -> bool:
        with self.lock:
            job = self.jobs.get(job_id)
        if job:
            job.cancel()
            return True
        return False

    def _run_job_wrapper(self, job: Job):
        """Wrapper enforcing timeout and catch-all safety."""
        start_time = time.time()
        try:
            self._run_job(job)
        except Exception as e:
            err_msg = str(e)
            sanitized_diag = SanitizedYTDLPLogger.sanitize_message(err_msg)
            logger.error("Job %s failed with exception: %s", job.job_id, sanitized_diag)
            if "429" in err_msg or "Too Many Requests" in err_msg:
                job.set_status("failed", error="Media provider is temporarily rate-limiting downloads. Please try again in a few minutes.")
            else:
                job.set_status("failed", error="Media processing failed. Please check the link or format.")

    def _run_job(self, job: Job):
        if job.is_cancelled:
            return

        if not job.set_status("processing"):
            return

        output_template = os.path.join(DOWNLOADS_DIR, f"{job.job_id}_%(title).100s.%(ext)s")

        def progress_hook(d):
            if job.is_cancelled:
                raise Exception("Job cancelled by user.")

            if d['status'] == 'downloading':
                total_bytes = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                downloaded_bytes = d.get('downloaded_bytes') or 0

                percent = 0.0
                if total_bytes > 0:
                    percent = (downloaded_bytes / total_bytes) * 100
                elif '_percent_str' in d:
                    try:
                        clean_p = d['_percent_str'].replace('%', '').strip()
                        percent = float(clean_p)
                    except Exception:
                        pass

                speed = d.get('_speed_str', '')
                eta = d.get('_eta_str', '')
                job.update_progress(percent, speed, eta)
            elif d['status'] == 'finished':
                job.update_progress(99.0, "Processing...", "")

        ydl_logger = None
        try:
            ffmpeg_path = get_ffmpeg_path()
            if ffmpeg_path:
                ffmpeg_dir = os.path.dirname(ffmpeg_path)
                if ffmpeg_dir not in os.environ.get("PATH", ""):
                    os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")

            # ----------------------------------------------------
            # 1. Image Download Handler (Safe fetch with SSRF guard)
            # ----------------------------------------------------
            if job.format_type == 'image':
                job.update_progress(10.0, "Fetching image details...", "")
                img_url = None
                raw_title = "media_image"

                try:
                    from services.youtube import extract_video_info
                    info = extract_video_info(job.url)
                    raw_title = info.get('title') or "media_image"
                    for opt in info.get('options', []):
                        if opt.get('type') == 'image' and opt.get('url'):
                            img_url = opt.get('url')
                            break
                    if not img_url:
                        img_url = info.get('thumbnail')
                except Exception:
                    pass

                if not img_url:
                    with yt_dlp.YoutubeDL({'skip_download': True, 'quiet': True}) as ydl:
                        info = ydl.extract_info(job.url, download=False)
                        img_url = info.get('thumbnail')
                        raw_title = info.get('title') or "media_image"

                if not img_url:
                    raise Exception("Could not find image for this post or pin.")

                clean_title = sanitize_filename(raw_title, max_length=60).replace(' ', '_')
                out_filename = f"{job.job_id}_{clean_title}.jpg"
                out_path = os.path.join(DOWNLOADS_DIR, out_filename)

                job.update_progress(50.0, "Saving full-resolution image...", "")
                img_bytes, _ = safe_http_fetch(img_url, allow_cdns=True, max_size_bytes=30 * 1024 * 1024)
                with open(out_path, 'wb') as f:
                    f.write(img_bytes)

                job.file_path = out_path
                job.filename = f"{clean_title}.jpg"
                job.file_size = os.path.getsize(out_path)
                job.progress = 100.0
                job.set_status("completed")
                return

            # ----------------------------------------------------
            # 2. Audio or Video Processing with yt-dlp
            # ----------------------------------------------------
            download_url = job.url.strip()
            if "youtube.com/shorts/" in download_url:
                m = re.search(r'youtube\.com/shorts/([a-zA-Z0-9_-]{11})', download_url)
                if m:
                    download_url = f"https://www.youtube.com/watch?v={m.group(1)}"
            elif "youtu.be/" in download_url:
                m = re.search(r'youtu\.be/([a-zA-Z0-9_-]{11})', download_url)
                if m:
                    download_url = f"https://www.youtube.com/watch?v={m.group(1)}"

            ydl_logger = SanitizedYTDLPLogger()
            ydl_opts: Dict[str, Any] = {
                'outtmpl': output_template,
                'progress_hooks': [progress_hook],
                'quiet': True,
                'no_warnings': False,
                'logger': ydl_logger,
                'socket_timeout': 15,
                'js_runtimes': get_js_runtime_config(),
                'remote_components': {'ejs:github'},
                'extractor_args': {
                    'youtube': {
                        'player_client': ['web_embedded']
                    }
                }
            }
            if ffmpeg_path:
                ydl_opts['ffmpeg_location'] = ffmpeg_path

            if job.format_type == 'audio':
                if not ffmpeg_path:
                    raise Exception("FFmpeg is required for MP3 audio conversion, but FFmpeg was not found on the server.")
                ydl_opts.update({
                    'format': 'bestaudio/best',
                    'postprocessors': [{
                        'key': 'FFmpegExtractAudio',
                        'preferredcodec': 'mp3',
                        'preferredquality': '320' if '320' in job.quality else '128',
                    }],
                })
            else:
                # Video format
                is_insta = 'instagram.com' in job.url
                is_fb = any(d in job.url for d in ['facebook.com', 'fb.watch', 'fb.com'])
                is_pin = any(d in job.url for d in ['pinterest.', 'pin.it'])
                height = job.quality.replace('p', '')

                if is_insta or is_pin:
                    ydl_opts.update({
                        'format': 'best[ext=mp4]/best/bestvideo+bestaudio',
                        'merge_output_format': 'mp4',
                    })
                elif is_fb:
                    if job.quality == "SD":
                        ydl_opts.update({
                            'format': 'sd/best[height<=480]/best',
                            'merge_output_format': 'mp4',
                        })
                    else:
                        ydl_opts.update({
                            'format': 'hd/bestvideo+bestaudio/best[ext=mp4]/best',
                            'merge_output_format': 'mp4',
                        })
                elif height.isdigit():
                    h = int(height)
                    format_spec = f'bestvideo[height<={h}]+bestaudio/bestvideo[width<={h}]+bestaudio/best[height<={h}]/best[width<={h}]/best'
                    if ffmpeg_path:
                        ydl_opts.update({
                            'format': format_spec,
                            'merge_output_format': 'mp4',
                        })
                    else:
                        ydl_opts.update({
                            'format': f'best[height<={h}]/best[width<={h}]/best',
                        })
                else:
                    if ffmpeg_path:
                        ydl_opts.update({
                            'format': 'bestvideo+bestaudio/best',
                            'merge_output_format': 'mp4',
                        })
                    else:
                        ydl_opts.update({
                            'format': 'best',
                        })

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(download_url, download=True)
                downloaded_file = ydl.prepare_filename(info)

                # Check if audio was converted to mp3
                if job.format_type == 'audio':
                    base, _ = os.path.splitext(downloaded_file)
                    mp3_path = base + ".mp3"
                    if os.path.exists(mp3_path):
                        downloaded_file = mp3_path
                    else:
                        raise Exception("FFmpeg failed to generate the MP3 audio file.")
                elif ydl_opts.get('merge_output_format'):
                    base, _ = os.path.splitext(downloaded_file)
                    merged_path = base + "." + ydl_opts['merge_output_format']
                    if os.path.exists(merged_path):
                        downloaded_file = merged_path

                if os.path.exists(downloaded_file):
                    job.file_path = downloaded_file
                    job.filename = os.path.basename(downloaded_file)
                    if job.filename.startswith(f"{job.job_id}_"):
                        job.filename = job.filename[len(job.job_id) + 1:]
                    job.file_size = os.path.getsize(downloaded_file)
                    job.progress = 100.0
                    job.set_status("completed")
                else:
                    matched = [f for f in os.listdir(DOWNLOADS_DIR) if f.startswith(job.job_id)]
                    if matched:
                        target = os.path.join(DOWNLOADS_DIR, matched[0])
                        job.file_path = target
                        job.filename = matched[0][len(job.job_id) + 1:]
                        job.file_size = os.path.getsize(target)
                        job.progress = 100.0
                        job.set_status("completed")
                    else:
                        raise Exception("Output file was not generated by media engine.")

        except Exception as e:
            if not job.is_cancelled:
                err_msg = str(e)
                sanitized_diag = SanitizedYTDLPLogger.sanitize_message(err_msg)
                logger.error("Job %s failed with exception: %s", job.job_id, sanitized_diag)
                if "FFmpeg is required" in err_msg:
                    job.set_status("failed", error="FFmpeg is required for MP3 audio conversion, but FFmpeg was not found on the server.")
                elif (ydl_logger and ydl_logger.encountered_429) or "429" in err_msg or "Too Many Requests" in err_msg:
                    job.set_status("failed", error="Media provider is temporarily rate-limiting downloads. Please try again in a few minutes.")
                else:
                    job.set_status("failed", error="Media processing failed. Please check the link or format.")
            # Clean up any partial download files left for this job
            try:
                for f in os.listdir(DOWNLOADS_DIR):
                    if f.startswith(job.job_id):
                        p = os.path.join(DOWNLOADS_DIR, f)
                        if os.path.isfile(p):
                            os.remove(p)
            except Exception:
                pass

    def _purge_stale_disk_files(self, max_age_seconds: int = 1800):
        """Scans DOWNLOADS_DIR directly to delete any file older than max_age_seconds."""
        if not os.path.exists(DOWNLOADS_DIR):
            return

        now = time.time()
        for filename in os.listdir(DOWNLOADS_DIR):
            filepath = os.path.join(DOWNLOADS_DIR, filename)
            try:
                if os.path.isfile(filepath):
                    mtime = os.path.getmtime(filepath)
                    if now - mtime > max_age_seconds:
                        os.remove(filepath)
                        logger.info("Purged stale download file: %s", filename)
            except Exception as e:
                logger.debug("Could not remove stale file %s: %s", filename, e)

    def _cleanup_loop(self):
        """Periodic background cleanup running every 5 minutes."""
        while True:
            time.sleep(300)
            now = time.time()
            expired_ids = []

            # Thread-safe snapshot of job items
            with self.lock:
                jobs_snapshot = list(self.jobs.items())

            for jid, job in jobs_snapshot:
                if now - job.created_at > 1800:
                    if job.file_path and os.path.exists(job.file_path):
                        try:
                            os.remove(job.file_path)
                        except Exception:
                            pass
                    expired_ids.append(jid)

            with self.lock:
                for jid in expired_ids:
                    self.jobs.pop(jid, None)

            # Also purge any orphaned files on disk left from past crashes or restarts
            self._purge_stale_disk_files(max_age_seconds=1800)

job_manager = JobManager()
