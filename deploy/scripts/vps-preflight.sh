#!/bin/sh
# Read-only preflight for the approved Ubuntu VPS topology. Never starts or changes services.
set -eu
fail() { printf '%s\n' "VPS preflight refused: $1" >&2; exit 1; }
for tool in uname awk getconf df docker python3 git env; do
  command -v "$tool" >/dev/null 2>&1 || fail 'Required operator tool is unavailable.'
done
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
[ "$(uname -s)" = Linux ] || fail 'Ubuntu Linux is required for public VPS startup.'
os_id=$(awk -F= '$1 == "ID" {gsub(/"/, "", $2); print $2}' /etc/os-release)
os_version=$(awk -F= '$1 == "VERSION_ID" {gsub(/"/, "", $2); print $2}' /etc/os-release)
[ "$os_id" = ubuntu ] && [ "$os_version" = 24.04 ] || fail 'Ubuntu 24.04 is the approved target.'
cpus=$(getconf _NPROCESSORS_ONLN)
memory_kb=$(awk '$1 == "MemTotal:" {print $2}' /proc/meminfo)
disk_report=$(df -Pk "$root") || fail 'Unable to inspect release-filesystem space.'
disk_kb=$(printf '%s\n' "$disk_report" | awk 'NR == 2 {print $4}')
for value in "$cpus" "$memory_kb" "$disk_kb"; do
  case "$value" in ''|*[!0-9]*) fail 'Resource inspection did not return valid counts.' ;; esac
done
[ "$cpus" -ge 2 ] || fail 'At least two CPUs are required.'
[ "$memory_kb" -ge 6291456 ] || fail 'At least 6 GiB detected RAM is required for the 8 GB target.'
[ "$disk_kb" -ge 10485760 ] || fail 'At least 10 GiB free release-filesystem space is required.'
if [ -n "${DOCKER_HOST:-}" ] && [ -z "${DOCKER_CONTEXT:-}" ]; then
  endpoint=$DOCKER_HOST
else
  endpoint=$(docker context inspect --format '{{.Endpoints.docker.Host}}')
fi
case "$endpoint" in unix://*) ;; *) fail 'Remote Docker engines are refused.' ;; esac
docker info >/dev/null 2>&1 || fail 'Local Docker engine is unavailable.'
docker compose version >/dev/null 2>&1 || fail 'Docker Compose is unavailable.'
head=$(git -c core.fsmonitor=false -C "$root" rev-parse --verify HEAD)
case "$head" in ''|*[!a-f0-9]*) fail 'Invalid release SHA.' ;; esac
[ "${#head}" -eq 40 ] || fail 'A full release SHA is required.'
[ "${IMAGE_TAG:-}" = "$head" ] || fail 'IMAGE_TAG must match the checked-out reviewed SHA.'
dirty=$(git -c core.fsmonitor=false -C "$root" status --porcelain) || fail 'Unable to inspect checkout status.'
[ -z "$dirty" ] || fail 'Dirty release checkouts are refused.'
# Validate the canonical base/review/public merges, independent of shell project/port overrides.
env -u STAGING_PROJECT -u HTTPS_PORT python3 "$root/deploy/scripts/check-config.py" || fail 'Compose validation failed.'
printf '%s\n' 'VPS preflight passed. Capacity, live HTTPS and recovery still require host acceptance.'
