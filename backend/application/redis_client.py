import redis.asyncio as aioredis
from .config import REDIS_URL

_redis_client: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        if REDIS_URL is None:
            raise RuntimeError("REDIS_URL must be set")
        _redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
    return _redis_client
