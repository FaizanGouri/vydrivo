import time
import threading
from typing import Dict, List, Tuple
from collections import defaultdict

class InMemoryRateLimiter:
    """
    Thread-safe sliding-window rate limiter by client IP.
    """
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.history: Dict[str, List[float]] = defaultdict(list)
        self.lock = threading.Lock()

    def is_allowed(self, client_ip: str) -> Tuple[bool, int]:
        """
        Checks if the request is permitted.
        Returns (is_allowed, retry_after_seconds).
        """
        now = time.time()
        cutoff = now - self.window_seconds

        with self.lock:
            # Clean old timestamps
            timestamps = [t for t in self.history[client_ip] if t > cutoff]
            self.history[client_ip] = timestamps

            if len(timestamps) >= self.max_requests:
                earliest = timestamps[0]
                retry_after = max(1, int(earliest + self.window_seconds - now))
                return False, retry_after

            self.history[client_ip].append(now)
            return True, 0

# 30 inspection requests per minute per IP
inspect_limiter = InMemoryRateLimiter(max_requests=30, window_seconds=60)

# 10 download job creations per minute per IP
job_limiter = InMemoryRateLimiter(max_requests=10, window_seconds=60)
