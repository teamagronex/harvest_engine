"""
HarvestEngine: Rate Limiting Service (Redis-ready with in-memory fallback)
Implements sliding-window rate limiting per IP / client key.
"""

import time
from collections import defaultdict
from typing import Callable, Dict, List, Optional
from fastapi import HTTPException, Request, Response, status
from app.config import settings


class InMemoryRateLimiter:
    """Thread-safe in-memory sliding-window log rate limiter for local development."""

    def __init__(self):
        self._history: Dict[str, List[float]] = defaultdict(list)

    def is_allowed(self, key: str, max_requests: int, window_seconds: int) -> tuple[bool, int, int]:
        now = time.time()
        window_start = now - window_seconds
        
        # Clean older requests outside the window
        timestamps = [t for t in self._history[key] if t > window_start]
        self._history[key] = timestamps

        if len(timestamps) >= max_requests:
            oldest = timestamps[0]
            retry_after = int(oldest + window_seconds - now) + 1
            remaining = 0
            return False, remaining, max(retry_after, 1)

        self._history[key].append(now)
        remaining = max_requests - len(self._history[key])
        return True, remaining, 0


# Global limiter instance
_in_memory_limiter = InMemoryRateLimiter()


def rate_limit(max_requests: int = 60, window_seconds: int = 60, key_prefix: str = "default"):
    """
    FastAPI dependency factory enforcing rate limits.
    Returns 429 Too Many Requests when rate limit is exceeded.
    """
    async def dependency(request: Request, response: Response):
        if not settings.RATE_LIMIT_ENABLED:
            return

        client_ip = request.client.host if request.client else "unknown"
        bucket_key = f"{key_prefix}:{client_ip}"

        allowed, remaining, retry_after = _in_memory_limiter.is_allowed(
            key=bucket_key,
            max_requests=max_requests,
            window_seconds=window_seconds,
        )

        response.headers["X-RateLimit-Limit"] = str(max_requests)
        response.headers["X-RateLimit-Remaining"] = str(remaining)

        if not allowed:
            response.headers["Retry-After"] = str(retry_after)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Try again in {retry_after} seconds.",
            )

    return dependency
