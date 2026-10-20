import re
import os
import sys
import shutil
import logging
from typing import Dict, Any, List, Optional
import yt_dlp
from services.security import validate_url, safe_http_fetch, SecurityValidationError

logger = logging.getLogger("vydrivo.youtube")

class MediaProviderRateLimitError(Exception):
    """Raised when the upstream provider (e.g. YouTube) returns HTTP 429 Too Many Requests."""
    pass

ALLOWED_CLIENTS = {
    'web', 'web_safari', 'web_embedded', 'web_music', 'web_creator',
    'android', 'android_vr', 'ios', 'visionos', 'mweb', 'tv', 'tv_downgraded', 'tv_simply'
}

HTTP_STATUS_REASONS = {
    "400": "Bad Request",
    "401": "Unauthorized",
    "403": "Forbidden",
    "404": "Not Found",
    "410": "Gone",
    "429": "Too Many Requests",
    "500": "Internal Server Error",
    "502": "Bad Gateway",
    "503": "Service Unavailable",
    "504": "Gateway Timeout",
}

class SanitizedYTDLPLogger:
    """
    Defense-in-depth logger that routes yt-dlp warnings and errors to backend logging.
    Prefers fixed allowlisted diagnostic messages for known error patterns
    (JS runtime, SABR, PO tokens, HTTP status codes) to ensure no raw URLs, tokens,
    signatures, or IP addresses can leak into logs. For unclassified strings, strictly
    strips all query parameters and sensitive parameter assignments.
    """
    def __init__(self):
        self.encountered_429 = False
        self.encountered_403 = False

    @staticmethod
    def categorize_message(msg: Any) -> Optional[str]:
        text = str(msg).strip()
        # 1. JavaScript challenge / runtime diagnostics
        if "No supported JavaScript runtime" in text or "EJS" in text:
            return "Missing JavaScript runtime for YouTube challenge solving (EJS)"
        if "n challenge solving failed" in text:
            return "JavaScript n-challenge solving failed: missing or incompatible JS runtime"

        # 2. YouTube SABR streaming restrictions
        sabr_match = re.search(r'Some (\w+) client https formats have been skipped', text)
        if sabr_match:
            client = sabr_match.group(1).lower()
            safe_client = client if client in ALLOWED_CLIENTS else "unknown"
            return f"SABR streaming restriction: formats skipped for client '{safe_client}'"

        # 3. Proof-of-Origin (PO) Token requirements
        pot_match = re.search(r'(\w+) client https formats require a GVS PO Token', text)
        if pot_match:
            client = pot_match.group(1).lower()
            safe_client = client if client in ALLOWED_CLIENTS else "unknown"
            return f"PO Token restriction: GVS PO Token required for client '{safe_client}'"

        # 4. HTTP status codes (mapped to fixed allowlisted reason string)
        http_match = re.search(r'HTTP Error (\d{3})', text)
        if http_match:
            code = http_match.group(1)
            reason = HTTP_STATUS_REASONS.get(code, "Error")
            return f"YouTube HTTP Error {code}: {reason}"

        # 5. Core player response and playability statuses
        if "Failed to extract any player response" in text:
            return "YouTube extraction failure: Failed to extract any player response across all clients"
        if "All player responses are invalid" in text:
            return "YouTube extraction failure: All player responses invalid (datacenter IP block suspected)"
        if "Requested format is not available" in text:
            return "YouTube format resolution: Requested format is not available"
        if "Private video" in text:
            return "YouTube extraction diagnostic: Video is private"
        if "Sign in to confirm your age" in text:
            return "YouTube extraction diagnostic: Age-restricted video requires authentication"
        if "This video is DRM protected" in text:
            return "YouTube extraction diagnostic: Video is DRM protected"

        return None

    @classmethod
    def sanitize_message(cls, msg: Any) -> str:
        # 1. Prefer fixed allowlisted diagnostic message
        category = cls.categorize_message(msg)
        if category:
            return category

        text = str(msg).strip()

        # 2. Redact complete query strings from URLs (both plain '?' and encoded '%3F'),
        # preserving trailing sentence punctuation (.,;:!?)>])
        def _strip_url_query(match):
            prefix = match.group(1)
            delim = match.group(2)
            tail = match.group(3)
            punct_m = re.search(r'([.,;:!?)>\]\'\"]+)$', tail)
            trailing_punct = punct_m.group(1) if punct_m else ""
            return f"{prefix}{delim}[QUERY_REDACTED]{trailing_punct}"

        text = re.sub(
            r'(https?://[^\s\?\"\'<>%]+)(\?|%3[fF])([^\s\"\'<>]+)',
            _strip_url_query,
            text
        )

        # 3. Redact sensitive parameter values (plain '=' and URL-encoded '%3D', preceded by '&', '%26', or word boundary)
        text = re.sub(
            r'(?i)(?:&|%26|\b)(po_token|visitor_data|signature|sig|token|key|secret|auth|password)(?:=|%3D)([a-zA-Z0-9_\-\.%]+)',
            r'\1=[REDACTED]',
            text
        )

        # 4. Bounded length to prevent log bloat
        if len(text) > 300:
            text = text[:300] + "... [TRUNCATED]"

        return text

    def debug(self, msg: str):
        pass

    def info(self, msg: str):
        pass

    def warning(self, msg: str):
        text = str(msg)
        if "429" in text or "Too Many Requests" in text:
            self.encountered_429 = True
        if "403" in text or "Forbidden" in text:
            self.encountered_403 = True
        logger.warning("yt-dlp warning: %s", self.sanitize_message(msg))

    def error(self, msg: str):
        text = str(msg)
        if "429" in text or "Too Many Requests" in text:
            self.encountered_429 = True
        if "403" in text or "Forbidden" in text:
            self.encountered_403 = True
        logger.error("yt-dlp error: %s", self.sanitize_message(msg))

# YouTube URL regex matching standard videos, shorts, and music
YOUTUBE_REGEX = re.compile(
    r'^(https?://)?(www\.|m\.)?(youtube\.com/(watch\?v=|shorts/|embed/)|youtu\.be/)([a-zA-Z0-9_-]{11})'
)

# Instagram URL regex matching reels, posts, p, tv
INSTAGRAM_REGEX = re.compile(
    r'^(https?://)?(www\.)?instagram\.com/(reel|reels|p|tv)/([a-zA-Z0-9_-]+)'
)

# Facebook URL regex matching videos, reels, watch, share, posts
FACEBOOK_REGEX = re.compile(
    r'^(https?://)?([a-zA-Z0-9_\-]+\.)?(facebook\.com|fb\.watch|fb\.com)/.+$',
    re.IGNORECASE
)

# Pinterest URL regex matching pins, idea pins, pin.it short links
PINTEREST_REGEX = re.compile(
    r'^(https?://)?([a-zA-Z0-9_\-]+\.)?(pinterest\.(com|[a-z]{2,3}(\.[a-z]{2})?)|pin\.it)/.+$',
    re.IGNORECASE
)

def is_valid_youtube_url(url: str) -> bool:
    if not url:
        return False
    return bool(YOUTUBE_REGEX.search(url.strip()))

def is_valid_instagram_url(url: str) -> bool:
    if not url:
        return False
    return bool(INSTAGRAM_REGEX.search(url.strip()))

def is_valid_facebook_url(url: str) -> bool:
    if not url:
        return False
    return bool(FACEBOOK_REGEX.search(url.strip()))

def is_valid_pinterest_url(url: str) -> bool:
    if not url:
        return False
    return bool(PINTEREST_REGEX.search(url.strip()))

def is_valid_supported_url(url: str) -> bool:
    if not url:
        return False
    try:
        validate_url(url, require_dns_check=False)
    except SecurityValidationError:
        return False

    return (
        is_valid_youtube_url(url)
        or is_valid_instagram_url(url)
        or is_valid_facebook_url(url)
        or is_valid_pinterest_url(url)
    )

def extract_pinterest_pin_data(url: str) -> Optional[Dict[str, Any]]:
    """
    Fallback scraper for Pinterest image pins when yt-dlp finds no video formats.
    Protected with SSRF validation, DNS checks, and bounded response limits.
    """
    import html as py_html
    try:
        page_bytes, content_type = safe_http_fetch(url, allow_cdns=False, max_size_bytes=5 * 1024 * 1024)
        page_text = page_bytes.decode('utf-8', errors='ignore')
        final_url = url

        preload_m = re.search(r'id=["\']pin-image-preload["\'][^>]+href=["\']([^"\']+)["\']', page_text)
        if not preload_m:
            preload_m = re.search(r'href=["\']([^"\']+)["\'][^>]+id=["\']pin-image-preload["\']', page_text)

        img_candidate = preload_m.group(1) if preload_m else None
        if not img_candidate:
            matches = re.findall(r'https://i\.pinimg\.com/(?:originals|736x|564x|474x)/[a-zA-Z0-9/_\-]+\.(?:jpg|jpeg|png|webp)', page_text)
            if matches:
                img_candidate = matches[0]

        orig_img = None
        if img_candidate:
            orig_candidate = re.sub(r'/\d+x(?:[0-9]*)/', '/originals/', img_candidate)
            orig_candidate = re.sub(r'/\d+x/', '/originals/', orig_candidate)
            try:
                head_resp = requests.head(orig_candidate, headers=headers, timeout=5)
                if head_resp.status_code == 200:
                    orig_img = orig_candidate
                else:
                    orig_img = img_candidate
            except Exception:
                orig_img = orig_candidate

        title_m = re.search(r'<title>(.*?)</title>', page_text, re.DOTALL)
        raw_title = title_m.group(1).strip() if title_m else "Pinterest Pin"
        clean_title = re.sub(r'\s*\|\s*Pinterest.*$', '', raw_title, flags=re.IGNORECASE)
        clean_title = py_html.unescape(clean_title).strip() or "Pinterest Pin"

        pin_id_m = re.search(r'/pin/(\d+)', final_url)
        pin_id = pin_id_m.group(1) if pin_id_m else "pinterest_pin"

        return {
            "id": pin_id,
            "title": clean_title,
            "image": orig_img or img_candidate,
            "url": final_url,
            "uploader": "Pinterest Creator"
        }
    except Exception:
        return None

def get_js_runtime_config() -> Dict[str, Any]:
    """
    Detects available Deno binary from virtualenv Scripts/bin or system PATH
    and returns yt-dlp js_runtimes configuration.
    """
    venv_dir = os.path.dirname(sys.executable)
    deno_exe = "deno.exe" if sys.platform == "win32" else "deno"
    venv_deno = os.path.join(venv_dir, deno_exe)

    deno_path = None
    if os.path.exists(venv_deno):
        deno_path = venv_deno
    else:
        deno_path = shutil.which("deno")

    if deno_path:
        return {'deno': {'path': deno_path}}
    return {'deno': {}}

def get_impersonate_target():
    """
    Returns Chrome ImpersonateTarget if curl_cffi is available,
    mimicking genuine Chrome browser TLS fingerprint to bypass cloud datacenter IP blocks.
    """
    try:
        from yt_dlp.networking.impersonate import ImpersonateTarget
        import curl_cffi
        return ImpersonateTarget.from_str('chrome')
    except Exception:
        return None

def extract_video_info(url: str) -> Dict[str, Any]:
    """
    Extracts metadata, thumbnails, duration, and available quality formats
    using yt-dlp for YouTube, Instagram, Facebook, and Pinterest without downloading media.
    """
    # Normalize YouTube shorts or shortlinks to standard watch URLs for robust player extraction
    clean_url = url.strip()
    if "youtube.com/shorts/" in clean_url:
        m = re.search(r'youtube\.com/shorts/([a-zA-Z0-9_-]{11})', clean_url)
        if m:
            clean_url = f"https://www.youtube.com/watch?v={m.group(1)}"
    elif "youtu.be/" in clean_url:
        m = re.search(r'youtu\.be/([a-zA-Z0-9_-]{11})', clean_url)
        if m:
            clean_url = f"https://www.youtube.com/watch?v={m.group(1)}"

    ydl_logger = SanitizedYTDLPLogger()
    ydl_opts = {
        'skip_download': True,
        'quiet': True,
        'no_warnings': False,
        'logger': ydl_logger,
        'extract_flat': False,
        'js_runtimes': get_js_runtime_config(),
        'remote_components': {'ejs:github'},
        'extractor_args': {
            'youtube': {
                'player_client': ['web_embedded']
            }
        }
    }

    imp = get_impersonate_target()
    if imp:
        ydl_opts['impersonate'] = imp

    is_insta = is_valid_instagram_url(url)
    is_fb = is_valid_facebook_url(url)
    is_pin = is_valid_pinterest_url(url)

    info = None
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(clean_url, download=False)
    except Exception as e:
        # If it's a Pinterest link and yt-dlp reports No video formats found
        if is_pin or "No video formats found" in str(e):
            pin_data = extract_pinterest_pin_data(url)
            if pin_data and pin_data.get("image"):
                return {
                    "id": pin_data.get("id") or "pinterest_pin",
                    "url": pin_data.get("url") or url,
                    "title": pin_data.get("title") or "Pinterest Pin",
                    "thumbnail": pin_data.get("image"),
                    "duration": None,
                    "duration_formatted": None,
                    "uploader": pin_data.get("uploader") or "Pinterest Creator",
                    "view_count": None,
                    "platform": "pinterest",
                    "is_short": False,
                    "options": [
                        {
                            "quality": "Original",
                            "format": "jpg",
                            "label": "Download Full-Res Pin Image (JPG)",
                            "type": "image",
                            "url": pin_data.get("image")
                        }
                    ]
                }
        if ydl_logger.encountered_429 or "429" in str(e) or "Too Many Requests" in str(e):
            raise MediaProviderRateLimitError(
                "The media provider is currently rate-limiting requests. Please try again in a few minutes."
            ) from e
        raise e
# Determine title, thumbnail, duration, author
    if is_insta:
        default_title = f"Instagram {'Reel' if '/reel' in url else 'Post'}"
    elif is_fb:
        default_title = f"Facebook {'Reel' if '/reel' in url else 'Video'}"
    elif is_pin:
        default_title = "Pinterest Pin"
    else:
        default_title = "Untitled Video"

    title = info.get('title') or default_title
    thumbnail = info.get('thumbnail')
    duration = info.get('duration') # in seconds
    uploader = (
        info.get('uploader') or info.get('channel') or info.get('uploader_id')
        or ('Instagram Creator' if is_insta else ('Facebook Creator' if is_fb else ('Pinterest Creator' if is_pin else 'Unknown Creator')))
    )
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
    elif is_fb:
        # Facebook Video / Reel / Post
        has_sd = any(
            'sd' in (f.get('format_id') or '').lower() or ((f.get('height') or 0) > 0 and (f.get('height') or 0) < 720)
            for f in formats_list
        )

        available_options.append({
            "quality": "HD",
            "format": "mp4",
            "label": "High Quality Video / Reel (HD MP4)",
            "type": "video"
        })
        if has_sd:
            available_options.append({
                "quality": "SD",
                "format": "mp4",
                "label": "Standard Quality Video (SD MP4)",
                "type": "video"
            })
        available_options.append({
            "quality": "320kbps",
            "format": "mp3",
            "label": "Extract Audio (MP3 - 320 kbps)",
            "type": "audio"
        })
        if thumbnail:
            available_options.append({
                "quality": "Original",
                "format": "jpg",
                "label": "Download Image / Cover (JPG)",
                "type": "image",
                "url": thumbnail
            })
    elif is_pin:
        # Pinterest Pin Video / Image
        has_video = any(f.get('vcodec') != 'none' for f in formats_list)
        if has_video:
            available_options.append({
                "quality": "HD",
                "format": "mp4",
                "label": "High Quality Pin Video (MP4)",
                "type": "video"
            })
            available_options.append({
                "quality": "320kbps",
                "format": "mp3",
                "label": "Extract Audio (MP3 - 320 kbps)",
                "type": "audio"
            })
        if thumbnail:
            available_options.append({
                "quality": "Original",
                "format": "jpg",
                "label": "Download Full-Res Pin Image (JPG)",
                "type": "image",
                "url": thumbnail
            })
    else:
        # YouTube standard format heights
        standard_heights = [1080, 720, 480, 360]
        seen_heights = set()

        for h in standard_heights:
            has_resolution = any(
                (min(f.get('width') or 0, f.get('height') or 0) == h if ((f.get('width') or 0) > 0 and (f.get('height') or 0) > 0) else f.get('height') == h) and f.get('vcodec') != 'none'
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
        "platform": "instagram" if is_insta else ("facebook" if is_fb else ("pinterest" if is_pin else "youtube")),
        "is_short": ("/shorts/" in url) or ("/reel" in url),
        "options": available_options
    }

def format_duration(seconds: Any) -> str:
    if not seconds:
        return "0:00"
    try:
        total_seconds = int(round(float(seconds)))
    except (ValueError, TypeError):
        return "0:00"

    m, s = divmod(total_seconds, 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"
