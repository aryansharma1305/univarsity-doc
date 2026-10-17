#!/bin/sh
set -eu
. /operations/read-minio.sh
export MC_HOST_local="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@minio:9000"
export MC_CONFIG_DIR=/tmp/.mc
exec mc "$@"
