"""Object storage for profile photos.

Two backends sit behind one interface: MinIO for local docker-compose and
Google Cloud Storage for Cloud Run. STORAGE_BACKEND picks between them.

Both name objects `{user_id}/{sha256}`, so a key written by one backend stays
valid if the other reads it. Photos are never served straight from the bucket
-- GET /profile/photo/{key} proxies them so the ownership and blocking checks
in the photos endpoint actually bind -- which is why the GCS bucket has public
access prevention enforced.
"""

import hashlib
import os
from dataclasses import dataclass
from typing import Iterator

BACKEND = os.getenv("STORAGE_BACKEND", "minio").lower()

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ROOT_USER", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_ROOT_PASSWORD", "minioadmin123")

BUCKET = (
    os.getenv("GCS_BUCKET_NAME", "")
    if BACKEND == "gcs"
    else os.getenv("MINIO_BUCKET", "photos")
)

_CHUNK_SIZE = 256 * 1024

_s3_client = None
_gcs_bucket = None


class PhotoNotFound(Exception):
    """No object under that key. Backend-neutral so callers need no SDK import."""


@dataclass
class StoredPhoto:
    """A photo being streamed out of the bucket."""

    content_type: str
    chunks: Iterator[bytes]


def normalize_key(key: str) -> str:
    """Strip the bucket prefix off keys stored as full URLs by older rows."""
    if BUCKET and f"/{BUCKET}/" in key:
        return key.split(f"/{BUCKET}/")[-1]
    return key


def _photo_key(user_id: int, file_bytes: bytes) -> str:
    digest = hashlib.sha256(file_bytes).hexdigest()
    return f"{user_id}/{digest}"


# ── MinIO ────────────────────────────────────────────────────────────────


def _get_s3():
    global _s3_client
    if _s3_client is None:
        import boto3
        from botocore.client import Config

        _s3_client = boto3.client(
            "s3",
            endpoint_url=f"http://{MINIO_ENDPOINT}",
            aws_access_key_id=MINIO_ACCESS_KEY,
            aws_secret_access_key=MINIO_SECRET_KEY,
            config=Config(signature_version="s3v4"),
            region_name="us-east-1",
        )
    return _s3_client


def _minio_ensure_bucket() -> None:
    from botocore.exceptions import ClientError

    s3 = _get_s3()
    existing = [b["Name"] for b in s3.list_buckets().get("Buckets", [])]
    if BUCKET not in existing:
        s3.create_bucket(Bucket=BUCKET)
    try:
        s3.delete_bucket_policy(Bucket=BUCKET)
    except ClientError:
        pass


def _minio_upload(user_id: int, file_bytes: bytes, content_type: str) -> str:
    from botocore.exceptions import ClientError

    s3 = _get_s3()
    key = _photo_key(user_id, file_bytes)
    try:
        s3.head_object(Bucket=BUCKET, Key=key)
    except ClientError as e:
        if e.response["Error"]["Code"] == "404":
            s3.put_object(
                Bucket=BUCKET,
                Key=key,
                Body=file_bytes,
                ContentType=content_type,
            )
        else:
            raise
    return key


def _minio_get(key: str) -> StoredPhoto:
    from botocore.exceptions import ClientError

    try:
        obj = _get_s3().get_object(Bucket=BUCKET, Key=normalize_key(key))
    except ClientError as e:
        if e.response["Error"]["Code"] in ("404", "NoSuchKey", "NoSuchBucket"):
            raise PhotoNotFound(key) from e
        raise
    return StoredPhoto(
        content_type=obj.get("ContentType", "application/octet-stream"),
        chunks=obj["Body"].iter_chunks(),
    )


def _minio_delete(key: str) -> None:
    _get_s3().delete_object(Bucket=BUCKET, Key=normalize_key(key))


# ── Google Cloud Storage ─────────────────────────────────────────────────


def _get_gcs_bucket():
    """Cloud Run authenticates this off the attached service account."""
    global _gcs_bucket
    if _gcs_bucket is None:
        from google.cloud import storage

        if not BUCKET:
            raise RuntimeError("GCS_BUCKET_NAME is required when STORAGE_BACKEND=gcs")
        client = storage.Client(project=os.getenv("GCP_PROJECT_ID") or None)
        _gcs_bucket = client.bucket(BUCKET)
    return _gcs_bucket


def _gcs_ensure_bucket() -> None:
    """Confirm the bucket is reachable. Creating it is a deploy-time concern."""
    from google.cloud.exceptions import NotFound

    try:
        _get_gcs_bucket().reload()
    except NotFound as e:
        raise RuntimeError(f"GCS bucket {BUCKET!r} does not exist") from e


def _gcs_upload(user_id: int, file_bytes: bytes, content_type: str) -> str:
    key = _photo_key(user_id, file_bytes)
    blob = _get_gcs_bucket().blob(key)
    # The key is a digest of the bytes, so a hit is byte-identical already.
    if not blob.exists():
        blob.upload_from_string(file_bytes, content_type=content_type)
    return key


def _gcs_get(key: str) -> StoredPhoto:
    from google.cloud.exceptions import NotFound

    blob = _get_gcs_bucket().blob(normalize_key(key))
    try:
        blob.reload()
    except NotFound as e:
        raise PhotoNotFound(key) from e

    def _iter_chunks() -> Iterator[bytes]:
        # Streamed rather than downloaded whole: 512Mi of memory does not
        # survive many concurrent 5 MB photos held in full.
        with blob.open("rb") as fh:
            while chunk := fh.read(_CHUNK_SIZE):
                yield chunk

    return StoredPhoto(
        content_type=blob.content_type or "application/octet-stream",
        chunks=_iter_chunks(),
    )


def _gcs_delete(key: str) -> None:
    from google.cloud.exceptions import NotFound

    try:
        _get_gcs_bucket().blob(normalize_key(key)).delete()
    except NotFound:
        pass


# ── Public interface ─────────────────────────────────────────────────────


def ensure_bucket() -> None:
    if BACKEND == "gcs":
        _gcs_ensure_bucket()
    else:
        _minio_ensure_bucket()


def upload_photo(user_id: int, file_bytes: bytes, content_type: str) -> str:
    if BACKEND == "gcs":
        return _gcs_upload(user_id, file_bytes, content_type)
    return _minio_upload(user_id, file_bytes, content_type)


def get_photo_object(key: str) -> StoredPhoto:
    if BACKEND == "gcs":
        return _gcs_get(key)
    return _minio_get(key)


def delete_photo(key: str) -> None:
    if BACKEND == "gcs":
        _gcs_delete(key)
    else:
        _minio_delete(key)
