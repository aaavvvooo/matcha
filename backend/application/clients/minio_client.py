import boto3
import hashlib
import os
from botocore.client import Config
from botocore.exceptions import ClientError

ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
ACCESS_KEY = os.getenv("MINIO_ROOT_USER", "minioadmin")
SECRET_KEY = os.getenv("MINIO_ROOT_PASSWORD", "minioadmin123")
BUCKET = os.getenv("MINIO_BUCKET", "photos")
PUBLIC_URL = os.getenv("MINIO_PUBLIC_URL", "http://localhost:9000")

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
        s3.put_bucket_policy(
            Bucket=BUCKET,
            Policy=f"""{{
                "Version": "2012-10-17",
                "Statement": [{{
                    "Effect": "Allow",
                    "Principal": {{"AWS": ["*"]}},
                    "Action": ["s3:GetObject"],
                    "Resource": ["arn:aws:s3:::{BUCKET}/*"]
                }}]
            }}""",
        )


def upload_photo(file_bytes: bytes, content_type: str) -> str:
    s3 = get_s3()
    digest = hashlib.sha256(file_bytes).hexdigest()
    key = digest
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
    return f"{PUBLIC_URL}/{BUCKET}/{key}"


def delete_photo(url: str):
    key = url.split(f"/{BUCKET}/")[-1]
    get_s3().delete_object(Bucket=BUCKET, Key=key)
