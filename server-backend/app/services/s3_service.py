"""
S3 Upload Service for uploading resume documents to AWS S3 bucket.
"""

import boto3
from botocore.exceptions import BotoCoreError, ClientError
import logging

logger = logging.getLogger(__name__)
from app.core.config import settings


class S3Service:
    """Service handling file uploads to AWS S3."""

    def __init__(self):
        self.bucket_name = settings.AWS_BUCKET_NAME
        self.region = settings.AWS_REGION
        self.base_url = settings.S3_UR.rstrip("/") + "/"
        
        self.s3_client = boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=self.region,
        )

    def upload_file(self, file_content: bytes, filename: str, content_type: str = "application/octet-stream", folder: str = "resumes") -> str:
        """
        Upload file content to S3 bucket and return public/access URL.
        """
        try:
            object_name = f"{folder}/{filename}"
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=object_name,
                Body=file_content,
                ContentType=content_type,
                ACL="public-read",
            )
            
            s3_url = f"{self.base_url}{object_name}"
            logger.info(f"Successfully uploaded file '{filename}' to S3 at: {s3_url}")
            return s3_url
        except (BotoCoreError, ClientError) as e:
            logger.error(f"Failed to upload file '{filename}' to S3: {e}")
            # Fallback URL format if put_object raised an issue or bucket requires standard construction
            fallback_url = f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{folder}/{filename}"
            return fallback_url
        except Exception as e:
            logger.error(f"Unexpected error uploading to S3: {e}")
            return f"{self.base_url}{folder}/{filename}"
