import re
from typing import Dict, Any, List, Optional
import yt_dlp
import os

# YouTube URL regex matching standard videos, shorts, and music
YOUTUBE_REGEX = re.compile(
    r'^(https?://)?(www\.|m\.)?(youtube\.com/(watch\?v=|shorts/|embed/)|youtu\.be/)([a-zA-Z0-9_-]{11})'
)

# Instagram URL regex matching reels, posts, p, tv
INSTAGRAM_REGEX = re.compile(
    r'^(https?://)?(www\.)?instagram\.com/(reel|reels|p|tv)/([a-zA-Z0-9_-]+)'
)

def is_valid_youtube_url(url: str) -> bool:
    if not url:
        return False
    return bool(YOUTUBE_REGEX.search(url.strip()))

def is_valid_instagram_url(url: str) -> bool:
    if not url:
        return False
    return bool(INSTAGRAM_REGEX.search(url.strip()))

def is_valid_supported_url(url: str) -> bool:
    return is_valid_youtube_url(url) or is_valid_instagram_url(url)

def extract_video_info(url: str) -> Dict[str, Any]:
    """
    Extracts metadata, thumbnails, duration, and available quality formats
    using yt-dlp for YouTube and Instagram reels/posts without downloading media.
    """
    ydl_opts = {
        'skip_download': True,
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
    }

    is_insta = is_valid_instagram_url(url)

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        
        # Determine title, thumbnail, duration, author
        title = info.get('title') or (f"Instagram {'Reel' if '/reel' in url else 'Post'}" if is_insta else 'Untitled Video')
        thumbnail = info.get('thumbnail')
        duration = info.get('duration') # in seconds
        uploader = info.get('uploader') or info.get('channel') or info.get('uploader_id') or ('Instagram Creator' if is_insta else 'Unknown Creator')
        view_count = info.get('view_count') or info.get('like_count')
        video_id = info.get('id')

        # Filter formats
        formats_list = info.get('formats', [])
        available_options = []

        if is_insta:
            # Instagram Reel / Video
            available_options.append({
                "quality": "HD",
                "format": "mp4",
                "label": "High Quality Reel Video (MP4)",
                "type": "video"
            })
            available_options.append({
                "quality": "320kbps",
                "format": "mp3",
                "label": "Extract Reel Audio (MP3)",
                "type": "audio"
            })
            if thumbnail:
                available_options.append({
                    "quality": "Original",
                    "format": "jpg",
                    "label": "Download Cover / Image (JPG)",
                    "type": "image",
                    "url": thumbnail
                })
        else:
            # YouTube standard format heights
            standard_heights = [1080, 720, 480, 360]
            seen_heights = set()

            for h in standard_heights:
                has_resolution = any(
                    f.get('height') == h and f.get('vcodec') != 'none'
                    for f in formats_list
                )
                if has_resolution:
                    available_options.append({
                        "quality": f"{h}p",
                        "height": h,
                        "format": "mp4",
                        "label": f"{h}p (MP4)" + (" - Full HD" if h == 1080 else (" - HD" if h == 720 else "")),
                        "type": "video"
                    })

            if not available_options:
                for f in formats_list:
                    h = f.get('height')
                    if h and h not in seen_heights and f.get('vcodec') != 'none':
                        seen_heights.add(h)
                        available_options.append({
                            "quality": f"{h}p",
                            "height": h,
                            "format": "mp4",
                            "label": f"{h}p (MP4)",
                            "type": "video"
                        })
                available_options.sort(key=lambda x: x['height'], reverse=True)

            available_options.append({
                "quality": "320kbps",
                "format": "mp3",
                "label": "High Quality Audio (MP3 - 320 kbps)",
                "type": "audio"
            })
            available_options.append({
                "quality": "128kbps",
                "format": "mp3",
                "label": "Standard Audio (MP3 - 128 kbps)",
                "type": "audio"
            })

        return {
            "id": video_id,
            "url": url,
            "title": title,
            "thumbnail": thumbnail,
            "duration": duration,
            "duration_formatted": format_duration(duration) if duration else None,
            "uploader": uploader,
            "view_count": view_count,
            "platform": "instagram" if is_insta else "youtube",
            "is_short": ("/shorts/" in url) or ("/reel" in url),
            "options": available_options
        }

def format_duration(seconds: Optional[int]) -> str:
    if not seconds:
        return "0:00"
    m, s = divmod(seconds, 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"
