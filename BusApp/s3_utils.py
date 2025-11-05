import boto3
from botocore.exceptions import NoCredentialsError

def upload_to_s3(local_file, bucket, s3_path):
    s3 = boto3.client("s3")

    try:
        s3.upload_file(local_file, bucket, s3_path)
        print(f"Upladed {local_file} to s3://{bucket}/{s3_path}")
    except FileNotFoundError:
        print(f"File not found: {local_file}")
    except NoCredentialsError:
        print("AWS credentials not found. (RUN aws configure)")

def upload_folder_to_s3(local_dir, bucket, prefix=""):
    from pathlib import Path
    base = Path(local_dir)
    for path in base.rglob("*"):
        if path.is_file():
            rel_path = path.relative_to(base)
            s3_path = f"{prefix}/{rel_path}".strip("/")
            upload_to_s3(str(path), bucket, s3_path)

        
