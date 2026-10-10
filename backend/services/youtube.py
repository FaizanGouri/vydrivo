import re
from typing import Dict, Any, List, Optional
import yt_dlp
import os

# YouTube URL regex matching standard videos, shorts, and music
YOUTUBE_REGEX = re.compile(
    r'^(https?://)?(www\.|m\.)?(youtube\.com/(watch\?v=|shorts/|embed/)|youtu\.be/)([a-zA-Z0-9_-]{11})'
)

def is_valid_youtube_url(url: str) -> bool:
    if not url:
        return False
    return bool(YOUTUBE_REGEX.search(url.strip()))

def extract_video_info(url: str) -> Dict[str, Any]:
    """
    Extracts metadata, thumbnails, duration, and available quality formats
    using yt-dlp without downloading media.
    """
    ydl_opts = {
        'skip_download': True,
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        
        # Determine title, thumbnail, duration, author
        title = info.get('title', 'Untitled Video')
        thumbnail = info.get('thumbnail')
        duration = info.get('duration') # in seconds
        uploader = info.get('uploader') or info.get('channel', 'Unknown Creator')
        view_count = info.get('view_count')
        video_id = info.get('id')

        # Filter and organize formats
        formats_list = info.get('formats', [])
        
        # We collect standard video heights: 1080, 720, 480, 360
        standard_heights = [1080, 720, 480, 360]
        available_video_options = []
        seen_heights = set()

        for h in standard_heights:
            # Check if video stream is available with this resolution or higher
            has_resolution = any(
                f.get('height') == h and f.get('vcodec') != 'none'
                for f in formats_list
            )
            if has_resolution:
                # Estimate size if possible
                available_video_options.append({
                    "quality": f"{h}p",
                    "height": h,
                    "format": "mp4",
                    "label": f"{h}p (MP4)" + (" - Full HD" if h == 1080 else (" - HD" if h == 720 else "")),
                    "type": "video"
                })

        # If none of the exact standard heights match, grab best available video resolutions
        if not available_video_options:
            for f in formats_list:
                h = f.get('height')
                if h and h not in seen_heights and f.get('vcodec') != 'none':
                    seen_heights.add(h)
                    available_video_options.append({
                        "quality": f"{h}p",
                        "height": h,
                        "format": "mp4",
                        "label": f"{h}p (MP4)",
                        "type": "video"
                    })
            available_video_options.sort(key=lambda x: x['height'], reverse=True)

        # Audio options (MP3)
        available_audio_options = [
            {
                "quality": "320kbps",
                "format": "mp3",
                "label": "High Quality Audio (MP3 - 320 kbps)",
                "type": "audio"
            },
            {
                "quality": "128kbps",
                "format": "mp3",
                "label": "Standard Audio (MP3 - 128 kbps)",
                "type": "audio"
            }
        ]

        return {
            "id": video_id,
            "url": url,
            "title": title,
            "thumbnail": thumbnail,
            "duration": duration,
            "duration_formatted": format_duration(duration) if duration else None,
            "uploader": uploader,
            "view_count": view_count,
            "is_short": "/shorts/" in url,
            "options": available_video_options + available_audio_options
        }

def format_duration(seconds: Optional[int]) -> str:
    if not seconds:
        return "0:00"
    m, s = divmod(seconds, 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"
