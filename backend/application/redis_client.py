import redis.asyncio as aioredis
from .config import REDIS_URL


def get_redis():
    if REDIS_URL is None:
        raise RuntimeError("REDIS_URL must be set")
    return aioredis.from_url(REDIS_URL, decode_responses=True)
