import re
import socket
import ipaddress
import urllib.parse
from typing import Tuple, Optional, Set
import requests

# Maximum allowed URL length
MAX_URL_LENGTH = 2048

# Allowed platform base domains
ALLOWED_PRIMARY_DOMAINS = {
    "youtube.com",
    "youtu.be",
    "instagram.com",
    "facebook.com",
    "fb.watch",
    "fb.com",
    "pin.it",
    "pinterest.com",
}

# Pinterest regional top-level domains
PINTEREST_REGIONAL_REGEX = re.compile(
    r"^(.*\.)?pinterest\.(com|[a-z]{2,3}(\.[a-z]{2})?)$", re.IGNORECASE
)

# Allowed secondary CDN host suffixes for thumbnails / pin images
ALLOWED_CDN_DOMAINS = {
    "pinimg.com",
    "fbcdn.net",
    "cdninstagram.com",
    "ytimg.com",
    "googlevideo.com",
    "instagram.com",
    "facebook.com",
    "pinterest.com",
}

class SecurityValidationError(Exception):
    """Raised when a URL fails security or SSRF validation."""
    pass

def is_ip_disallowed(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """
    Returns True if an IP is private, loopback, link-local, multicast,
    cloud metadata (169.254.x.x), or reserved.
    """
    if (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    ):
        return True

    # Cloud metadata service protection (AWS, GCP, Azure, OpenStack)
    ip_str = ip.exploded
    if ip_str.startswith("169.254."):
        return True
    if ip_str.startswith("0."):
        return True
    # IPv6 mapping of IPv4
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        return is_ip_disallowed(ip.ipv4_mapped)

    return False

def is_hostname_allowed(hostname: str, allow_cdns: bool = False) -> bool:
    """
    Validates whether the canonical hostname belongs to an allowed platform.
    Prevents lookalike / subdomain attacks like 'evil-youtube.com' or 'youtube.com.attacker.com'.
    """
    if not hostname:
        return False

    hostname = hostname.lower().strip(".")

    # Reject raw IP addresses as platform hostnames
    try:
        ipaddress.ip_address(hostname)
        return False
    except ValueError:
        pass

    # Direct match or exact subdomain match for primary platforms
    for domain in ALLOWED_PRIMARY_DOMAINS:
        if hostname == domain or hostname.endswith("." + domain):
            return True

    # Check Pinterest international domains (e.g. in.pinterest.com, pinterest.co.uk)
    if PINTEREST_REGIONAL_REGEX.match(hostname):
        return True

    # Optional CDN domains for secondary media (images/thumbnails)
    if allow_cdns:
        for cdn in ALLOWED_CDN_DOMAINS:
            if hostname == cdn or hostname.endswith("." + cdn):
                return True

    return False

def validate_dns_resolution(hostname: str) -> None:
    """
    Resolves hostname to IP addresses and raises SecurityValidationError if
    any resolved IP points to private/internal/cloud metadata destinations.
    """
    try:
        addr_info = socket.getaddrinfo(hostname, None)
    except socket.gaierror as e:
        raise SecurityValidationError(f"Could not resolve hostname '{hostname}': {str(e)}")

    if not addr_info:
        raise SecurityValidationError(f"No IP addresses resolved for hostname '{hostname}'")

    for entry in addr_info:
        sockaddr = entry[4]
        ip_str = sockaddr[0]
        try:
            ip = ipaddress.ip_address(ip_str)
            if is_ip_disallowed(ip):
                raise SecurityValidationError(
                    f"Destination IP '{ip_str}' resolved from '{hostname}' is not permitted."
                )
        except ValueError:
            raise SecurityValidationError(f"Invalid IP address format: '{ip_str}'")

def validate_url(url: str, allow_cdns: bool = False, require_dns_check: bool = True) -> str:
    """
    Centralized URL validator & SSRF filter.
    - Validates scheme (HTTPS required)
    - Validates URL length
    - Validates absence of userinfo credentials
    - Validates platform hostname against strict allowlist
    - Validates DNS resolution to ensure no internal network / loopback targets
    """
    if not url or not isinstance(url, str):
        raise SecurityValidationError("URL must be a non-empty string.")

    url = url.strip()
    if len(url) > MAX_URL_LENGTH:
        raise SecurityValidationError(f"URL exceeds maximum allowed length of {MAX_URL_LENGTH} characters.")

    # Control character check
    if any(c in url for c in ['\r', '\n', '\0', '\t']):
        raise SecurityValidationError("URL contains invalid control characters.")

    parsed = urllib.parse.urlsplit(url)

    # Scheme validation (strict HTTPS, no file://, ftp://, javascript://)
    if parsed.scheme.lower() != "https":
        # Reject non-https (reject plain http, file, etc.)
        raise SecurityValidationError("Only secure HTTPS URLs are permitted.")

    # Userinfo / credentials validation (reject https://admin:password@youtube.com)
    if parsed.username or parsed.password or "@" in (parsed.netloc.split(":")[0]):
        raise SecurityValidationError("URLs containing credentials (userinfo) are not permitted.")

    hostname = parsed.hostname
    if not hostname:
        raise SecurityValidationError("Invalid URL: Missing hostname.")

    # Platform hostname allowlist check
    if not is_hostname_allowed(hostname, allow_cdns=allow_cdns):
        raise SecurityValidationError(
            f"Unsupported domain '{hostname}'. Only YouTube, Instagram, Facebook, and Pinterest URLs are supported."
        )

    # DNS Resolution check
    if require_dns_check:
        validate_dns_resolution(hostname)

    return url

def safe_http_fetch(
    url: str,
    allow_cdns: bool = True,
    max_redirects: int = 4,
    timeout: Tuple[int, int] = (5, 15),
    max_size_bytes: int = 30 * 1024 * 1024, # 30 MB max
    headers: Optional[dict] = None
) -> Tuple[bytes, str]:
    """
    Executes a safe outbound HTTP GET request with SSRF and redirect protection.
    - Re-validates every redirect destination against SSRF & domain checks.
    - Enforces maximum response body size to prevent memory exhaustion / compression bombs.
    - Enforces connection & read timeouts.
    """
    current_url = validate_url(url, allow_cdns=allow_cdns, require_dns_check=True)
    redirects_followed = 0

    default_headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    }
    if headers:
        default_headers.update(headers)

    session = requests.Session()
    # Disable automatic redirect following so we manually re-validate each hop
    session.max_redirects = 0

    while True:
        try:
            resp = session.get(
                current_url,
                headers=default_headers,
                allow_redirects=False,
                timeout=timeout,
                stream=True
            )
        except requests.RequestException as e:
            raise SecurityValidationError(f"Safe fetch failed for URL: {str(e)}")

        # Check for redirects
        if resp.status_code in (301, 302, 303, 307, 308):
            redirects_followed += 1
            if redirects_followed > max_redirects:
                raise SecurityValidationError("Too many redirects encountered.")

            location = resp.headers.get("Location")
            if not location:
                raise SecurityValidationError("Redirect status code without Location header.")

            # Resolve relative redirect URLs against current URL
            new_url = urllib.parse.urljoin(current_url, location)
            # Re-validate the redirect destination with SSRF and hostname checks!
            current_url = validate_url(new_url, allow_cdns=allow_cdns, require_dns_check=True)
            continue

        if resp.status_code != 200:
            raise SecurityValidationError(f"Target server returned HTTP {resp.status_code}")

        # Enforce max content length header if present
        content_length = resp.headers.get("Content-Length")
        if content_length and int(content_length) > max_size_bytes:
            raise SecurityValidationError(f"Content length {content_length} exceeds limit of {max_size_bytes} bytes.")

        # Read response body in chunks to prevent memory exhaustion
        body = bytearray()
        for chunk in resp.iter_content(chunk_size=65536):
            body.extend(chunk)
            if len(body) > max_size_bytes:
                raise SecurityValidationError(f"Response size exceeded {max_size_bytes} bytes.")

        final_content_type = resp.headers.get("Content-Type", "")
        return bytes(body), final_content_type

def sanitize_filename(filename: str, max_length: int = 100) -> str:
    """
    Sanitizes user/media filenames to prevent directory traversal, control characters,
    and filesystem errors across Windows, Linux, and macOS.
    """
    if not filename:
        return "media_file"

    import unicodedata
    # Normalize unicode to NFC
    filename = unicodedata.normalize("NFC", filename)

    # Remove any directory path components
    filename = filename.replace("\\", "/").split("/")[-1]
    
    # Strip dangerous characters (< > : " / \ | ? * and control chars)
    clean = re.sub(r'[\x00-\x1f\x7f-\x9f\\/:*?"<>|]', '_', filename)
    # Strip zero-width / bidirectional formatting chars
    clean = "".join(c for c in clean if not unicodedata.category(c).startswith("C"))
    clean = clean.strip(". ")
    if not clean:
        clean = "media_file"
    return clean[:max_length]
