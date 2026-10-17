#!/bin/sh
# Parse literal secret values; never execute a secret file as shell code.
while IFS='=' read -r name value; do
  case "$name" in
    MINIO_ROOT_USER|MINIO_ROOT_PASSWORD|S3_BUCKET|S3_ACCESS_KEY|S3_SECRET_KEY)
      export "$name=$value"
      ;;
    *) echo 'Invalid storage secret field' >&2; exit 1 ;;
  esac
done < /run/secrets/minio
