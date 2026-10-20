import os
import sys
import uuid
import time
import shutil
import asyncio
import threading
from typing import Dict, Any, Optional
import yt_dlp

DOWNLOADS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "downloads"))
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

def get_ffmpeg_path() -> Optional[str]:
    """
    Finds FFmpeg binary from environment, virtualenv Scripts,
    imageio-ffmpeg package, or system PATH.
    """
    # 1. Explicit environment variable
    env_path = os.environ.get("FFMPEG_PATH")
    if env_path and os.path.exists(env_path):
        return env_path

    # 2. Inside Python virtual environment Scripts directory
    venv_ffmpeg = os.path.join(os.path.dirname(sys.executable), "ffmpeg.exe")
    if os.path.exists(venv_ffmpeg):
        return venv_ffmpeg

    # 3. Bundled imageio-ffmpeg binary
    try:
        import imageio_ffmpeg
        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if exe and os.path.exists(exe):
            return exe
    except Exception:
        pass

    # 4. Global PATH
    bin_path = shutil.which("ffmpeg")
    if bin_path:
        return bin_path

    return None

class Job:
    def __init__(self, job_id: str, url: str, format_type: str, quality: str):
        self.job_id = job_id
        self.url = url
        self.format_type = format_type  # 'video' or 'audio'
        self.quality = quality          # e.g., '1080p', '720p', '320kbps'
        self.status = "queued"          # queued, processing, completed, failed, cancelled
        self.progress = 0.0
        self.speed = ""
        self.eta = ""
        self.filename = ""
        self.file_path = ""
        self.file_size = 0
        self.error = None
        self.created_at = time.time()
        self.updated_at = time.time()
        self.subscribers = []           # asyncio.Queue objects for SSE

    def update_progress(self, percent: float, speed: str = "", eta: str = ""):
        self.progress = round(percent, 1)
        self.speed = speed
        self.eta = eta
        self.updated_at = time.time()
        self._notify()

    def set_status(self, status: str, error: Optional[str] = None):
        self.status = status
        if error:
            self.error = error
        self.updated_at = time.time()
        self._notify()

    def _notify(self):
        data = self.to_dict()
        for q in self.subscribers:
            try:
                q.put_nowait(data)
            except Exception:
                pass

    def to_dict(self) -> Dict[str, Any]:
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
        # Start cleanup background task
        threading.Thread(target=self._cleanup_loop, daemon=True).start()

    def create_job(self, url: str, format_type: str, quality: str) -> Job:
        job_id = str(uuid.uuid4())
        job = Job(job_id, url, format_type, quality)
        self.jobs[job_id] = job
        # Start worker thread
        threading.Thread(target=self._run_job, args=(job,), daemon=True).start()
        return job

    def get_job(self, job_id: str) -> Optional[Job]:
        return self.jobs.get(job_id)

    def _run_job(self, job: Job):
        job.set_status("processing")
        
        output_template = os.path.join(DOWNLOADS_DIR, f"{job.job_id}_%(title).100s.%(ext)s")

        def progress_hook(d):
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

        try:
            ffmpeg_path = get_ffmpeg_path()
            if ffmpeg_path:
                ffmpeg_dir = os.path.dirname(ffmpeg_path)
                if ffmpeg_dir not in os.environ.get("PATH", ""):
                    os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")

            ydl_opts: Dict[str, Any] = {
                'outtmpl': output_template,
                'progress_hooks': [progress_hook],
                'quiet': True,
                'no_warnings': True,
            }
            if ffmpeg_path:
                ydl_opts['ffmpeg_location'] = ffmpeg_path

            if job.format_type == 'image':
                # Direct download of post/cover/pin image
                import urllib.request
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

                clean_title = "".join(c for c in raw_title if c.isalnum() or c in (' ', '_', '-')).strip()[:60]
                clean_title = clean_title.replace(' ', '_') or "media_image"
                out_filename = f"{job.job_id}_{clean_title}.jpg"
                out_path = os.path.join(DOWNLOADS_DIR, out_filename)

                job.update_progress(50.0, "Saving full-resolution image...", "")
                req = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req) as resp, open(out_path, 'wb') as f:
                    f.write(resp.read())
                job.file_path = out_path
                job.filename = f"{clean_title}.jpg"
                job.file_size = os.path.getsize(out_path)
                job.progress = 100.0
                job.set_status("completed")
                return

            if job.format_type == 'audio':
                if ffmpeg_path:
                    ydl_opts.update({
                        'format': 'bestaudio/best',
                        'postprocessors': [{
                            'key': 'FFmpegExtractAudio',
                            'preferredcodec': 'mp3',
                            'preferredquality': '320' if '320' in job.quality else '128',
                        }],
                    })
                else:
                    ydl_opts.update({
                        'format': 'bestaudio[ext=m4a]/bestaudio/best',
                    })
            else:
                # Video format
                is_insta = 'instagram.com' in job.url
                is_fb = any(d in job.url for d in ['facebook.com', 'fb.watch', 'fb.com'])
                is_pin = any(d in job.url for d in ['pinterest.', 'pin.it'])
                height = job.quality.replace('p', '')

                if is_insta or is_pin:
                    # For Instagram & Pinterest, prioritize single pre-muxed MP4 stream with audio,
                    # and fallback to separate streams merged with FFmpeg
                    ydl_opts.update({
                        'format': 'best[ext=mp4]/best/bestvideo+bestaudio',
                        'merge_output_format': 'mp4',
                    })
                elif is_fb:
                    # For Facebook, handle HD vs SD and progressive MP4s
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
                    if ffmpeg_path:
                        ydl_opts.update({
                            'format': f'bestvideo[height<={h}]+bestaudio/best[height<={h}]/best',
                            'merge_output_format': 'mp4',
                        })
                    else:
                        ydl_opts.update({
                            'format': f'best[height<={h}]/best',
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
                info = ydl.extract_info(job.url, download=True)
                downloaded_file = ydl.prepare_filename(info)
                
                # If audio was converted to mp3, the extension changed
                if job.format_type == 'audio':
                    base, _ = os.path.splitext(downloaded_file)
                    mp3_path = base + ".mp3"
                    if os.path.exists(mp3_path):
                        downloaded_file = mp3_path
                elif ydl_opts.get('merge_output_format'):
                    base, _ = os.path.splitext(downloaded_file)
                    merged_path = base + "." + ydl_opts['merge_output_format']
                    if os.path.exists(merged_path):
                        downloaded_file = merged_path

                if os.path.exists(downloaded_file):
                    job.file_path = downloaded_file
                    job.filename = os.path.basename(downloaded_file)
                    # Strip job_id prefix from public filename
                    if job.filename.startswith(f"{job.job_id}_"):
                        job.filename = job.filename[len(job.job_id) + 1:]
                    job.file_size = os.path.getsize(downloaded_file)
                    job.progress = 100.0
                    job.set_status("completed")
                else:
                    # Search directory for file matching job_id
                    matched = [f for f in os.listdir(DOWNLOADS_DIR) if f.startswith(job.job_id)]
                    if matched:
                        target = os.path.join(DOWNLOADS_DIR, matched[0])
                        job.file_path = target
                        job.filename = matched[0][len(job.job_id) + 1:]
                        job.file_size = os.path.getsize(target)
                        job.progress = 100.0
                        job.set_status("completed")
                    else:
                        raise Exception("Output file was not generated.")

        except Exception as e:
            job.set_status("failed", error=str(e))

    def _cleanup_loop(self):
        """Cleans up files older than 30 minutes to manage disk space."""
        while True:
            time.sleep(300)  # Check every 5 minutes
            now = time.time()
            expired_ids = []
            for jid, job in self.jobs.items():
                if now - job.created_at > 1800:  # 30 mins
                    if job.file_path and os.path.exists(job.file_path):
                        try:
                            os.remove(job.file_path)
                        except Exception:
                            pass
                    expired_ids.append(jid)
            for jid in expired_ids:
                del self.jobs[jid]

job_manager = JobManager()
