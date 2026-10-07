#!/bin/sh
# MinIO entrypoint for local development:
#   start the server → wait until it is ready → run the idempotent bootstrap → keep serving.
# The container only reports healthy after bootstrap succeeded (see the healthcheck marker), so
# `docker compose up -d --wait` returning means the bucket and application user exist.
set -eu

marker=/tmp/.docversity-initialised
rm -f "${marker}"

minio server /data --console-address ':9001' &
server_pid=$!
trap 'kill -TERM "${server_pid}" 2>/dev/null; wait "${server_pid}"; exit 0' TERM INT

attempts=0
until mc ready local >/dev/null 2>&1; do
  attempts=$((attempts + 1))
  if [ "${attempts}" -ge 60 ]; then
    echo "minio-entrypoint: server did not become ready in time" >&2
    kill -TERM "${server_pid}" 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

if ! /bin/sh /docker/minio/init.sh; then
  echo "minio-entrypoint: bootstrap failed" >&2
  kill -TERM "${server_pid}" 2>/dev/null || true
  exit 1
fi
touch "${marker}"

wait "${server_pid}"
