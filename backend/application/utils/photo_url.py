from application.config import REACT_APP_API_URL
from application.clients.minio_client import BUCKET

_BACKEND_URL = REACT_APP_API_URL or "http://localhost:8000"


def _normalize_key(key: str) -> str:
    if f"/{BUCKET}/" in key:
        return key.split(f"/{BUCKET}/")[-1]
    return key


def to_photo_url(key: str | None) -> str | None:
    if not key:
        return key
    return f"{_BACKEND_URL}/profile/photo/{_normalize_key(key)}"
