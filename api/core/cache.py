"""Simple in-memory TTL cache for API responses."""

import time
from typing import Any

_cache: dict[str, tuple[float, Any]] = {}
_DEFAULT_TTL = 300  # 5 minutes


def cache_get(key: str) -> Any | None:
    """Get a cached value if it exists and hasn't expired."""
    entry = _cache.get(key)
    if entry is None:
        return None
    expires_at, value = entry
    if time.time() > expires_at:
        del _cache[key]
        return None
    return value


def cache_set(key: str, value: Any, ttl: int = _DEFAULT_TTL) -> None:
    """Set a cached value with TTL in seconds."""
    _cache[key] = (time.time() + ttl, value)
