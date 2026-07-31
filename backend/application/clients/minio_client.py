import boto3
import hashlib
import os
from botocore.client import Config
from botocore.exceptions import ClientError

ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
ACCESS_KEY = os.getenv("MINIO_ROOT_USER", "minioadmin")
SECRET_KEY = os.getenv("MINIO_ROOT_PASSWORD", "minioadmin123")
BUCKET = os.getenv("MINIO_BUCKET", "photos")

_client = None


def get_s3():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            endpoint_url=f"http://{ENDPOINT}",
            aws_access_key_id=ACCESS_KEY,
            aws_secret_access_key=SECRET_KEY,
            config=Config(signature_version="s3v4"),
            region_name="us-east-1",
        )
    return _client


def ensure_bucket():
    s3 = get_s3()
    existing = [b["Name"] for b in s3.list_buckets().get("Buckets", [])]
    if BUCKET not in existing:
        s3.create_bucket(Bucket=BUCKET)
    try:
        s3.delete_bucket_policy(Bucket=BUCKET)
    except ClientError:
        pass


def _normalize_key(key: str) -> str:
    if f"/{BUCKET}/" in key:
        return key.split(f"/{BUCKET}/")[-1]
    return key


def upload_photo(user_id: int, file_bytes: bytes, content_type: str) -> str:
    s3 = get_s3()
    digest = hashlib.sha256(file_bytes).hexdigest()
    key = f"{user_id}/{digest}"
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


def get_photo_object(key: str):
    return get_s3().get_object(Bucket=BUCKET, Key=_normalize_key(key))


def delete_photo(key: str):
    get_s3().delete_object(Bucket=BUCKET, Key=_normalize_key(key))
