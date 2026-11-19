#!/usr/bin/env python3
"""Count alert-relevant API log lines from stdin (docker logs of the api container).

The API logs one JSON object per line: {"level","status","path","msg",...}. Prints one line:
  5xx=<n> error=<n> 429=<n> top429=<path or ->
Only counts and a path prefix are printed (never messages or values).
"""
import collections
import json
import sys


def count(lines):
    five = err = rl = 0
    paths = collections.Counter()
    for line in lines:
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        if not isinstance(entry, dict):
            continue
        status = entry.get("status")
        if isinstance(status, int):
            five += status >= 500
            if status == 429:
                rl += 1
                path = str(entry.get("path", "")).split("?")[0]
                paths["/".join(path.split("/")[:5])] += 1
        err += str(entry.get("level", "")).lower() in ("error", "fatal")
    top = paths.most_common(1)[0][0] if paths else "-"
    return f"5xx={five} error={err} 429={rl} top429={top}"


if __name__ == "__main__":
    print(count(sys.stdin))
