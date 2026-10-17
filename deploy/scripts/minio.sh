#!/bin/sh
set -eu
. /deploy/read-minio.sh
export MINIO_ROOT_USER MINIO_ROOT_PASSWORD S3_BUCKET S3_ACCESS_KEY S3_SECRET_KEY
export MC_HOST_local="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@127.0.0.1:9000"
export MC_CONFIG_DIR=/tmp/.mc
exec /bin/sh /docker/minio/entrypoint.sh
