#!/bin/sh
# Phase 14C edge entrypoint: refuse to start unless every edge setting is present and well-formed.
# Caddy itself would silently accept an empty trusted-proxy list or header (fail closed here instead).
set -eu
fail() { echo "edge: refusing to start: $1" >&2; exit 1; }
case "${PORT:-}" in '' | *[!0-9]*) fail 'PORT must be a number' ;; esac
case "${RENDER_CLIENT_IP_HEADER:-}" in
X-Forwarded-For | True-Client-IP | CF-Connecting-IP) ;;
*) fail 'RENDER_CLIENT_IP_HEADER must be X-Forwarded-For, True-Client-IP or CF-Connecting-IP' ;;
esac
[ -n "${RENDER_TRUSTED_PROXIES:-}" ] || fail 'RENDER_TRUSTED_PROXIES is required'
printf '%s' "$RENDER_TRUSTED_PROXIES" | grep -Eq '^(private_ranges|[0-9a-f.:]+/[0-9]{1,3})( (private_ranges|[0-9a-f.:]+/[0-9]{1,3}))*$' ||
	fail 'RENDER_TRUSTED_PROXIES must be private_ranges and/or CIDRs separated by spaces'
[ -r /etc/secrets/review_gate.caddy ] || fail 'reviewer gate secret file missing or unreadable'
exec caddy-unprivileged run --config /etc/caddy/Caddyfile --adapter caddyfile
