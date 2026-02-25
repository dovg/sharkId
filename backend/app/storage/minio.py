import threading

import boto3
from botocore.client import Config

from app.config import settings

_client_instance = None
_client_lock = threading.Lock()


def _client():
    global _client_instance
    if _client_instance is None:
        with _client_lock:
            if _client_instance is None:
                _client_instance = boto3.client(
                    "s3",
                    endpoint_url=f"http://{settings.minio_endpoint}",
                    aws_access_key_id=settings.minio_root_user,
                    aws_secret_access_key=settings.minio_root_password,
                    config=Config(signature_version="s3v4"),
                    region_name="us-east-1",
                )
    return _client_instance


def upload_file(data: bytes, object_key: str, content_type: str) -> str:
    """Upload bytes to MinIO. Returns the object_key."""
    _client().put_object(
        Bucket=settings.minio_bucket,
        Key=object_key,
        Body=data,
        ContentType=content_type,
    )
    return object_key


def get_presigned_url(object_key: str, expires: int = 3600) -> str:
    """Return a time-limited presigned URL for the given object."""
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.minio_bucket, "Key": object_key},
        ExpiresIn=expires,
    )


def get_object_bytes(object_key: str) -> bytes:
    """Download an object from MinIO and return its bytes."""
    obj = _client().get_object(Bucket=settings.minio_bucket, Key=object_key)
    return obj["Body"].read()


def delete_file(object_key: str) -> None:
    """Delete an object from MinIO."""
    _client().delete_object(Bucket=settings.minio_bucket, Key=object_key)
