#!/bin/sh
set -eu
# Docker restarts must validate the gate too, without relying on a human launcher invocation.
gate=${1:-/run/secrets/reviewer_gate}
fail() { printf '%s\n' 'Shared edge refused: reviewer gate missing, writable or malformed' >&2; exit 1; }
[ -f "$gate" ] && [ ! -L "$gate" ] || fail
# BusyBox test -w treats root as writable even on a read-only bind; inspect the mode instead.
mode=$(stat -c '%a' "$gate" 2>/dev/null || stat -f '%Lp' "$gate") || fail
case "$mode" in ''|*[!0-7]*) fail ;; esac
[ "$((0$mode & 0222))" -eq 0 ] || fail
[ "$(wc -l < "$gate" | tr -d ' ')" = 5 ] || fail
sed -n '1p' "$gate" | grep -Fxq '(reviewer_gate) {' || fail
sed -n '2p' "$gate" | grep -Fxq "$(printf '\tbasic_auth @gated {')" || fail
sed -n '3p' "$gate" | grep -Eq '^'"$(printf '\t\t')"'[a-z]{3,32} \$2[aby]\$1[0-9]\$[./A-Za-z0-9]{53}$' || fail
sed -n '4p' "$gate" | grep -Fxq "$(printf '\t}')" || fail
sed -n '5p' "$gate" | grep -Fxq '}' || fail
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
