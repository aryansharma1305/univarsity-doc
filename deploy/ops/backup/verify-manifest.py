#!/usr/bin/env python3
"""Check a backup set against its manifest.json (relative path -> sha256).

Usage: verify-manifest.py <set dir>. Exit 0 only if every listed file exists with the listed hash
and no unlisted file exists (manifest.json itself excluded). Prints counts only, never contents.
"""
import hashlib
import json
import os
import sys


def main(root: str) -> int:
    with open(os.path.join(root, "manifest.json"), encoding="utf-8") as fh:
        manifest = json.load(fh)
    present = set()
    for base, _dirs, files in os.walk(root):
        for name in files:
            rel = os.path.relpath(os.path.join(base, name), root)
            if rel != "manifest.json":
                present.add(rel)
    bad = 0
    for rel, expected in manifest.items():
        path = os.path.join(root, rel)
        if not os.path.isfile(path):
            bad += 1
            continue
        digest = hashlib.sha256()
        with open(path, "rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b""):
                digest.update(chunk)
        bad += digest.hexdigest() != expected
    extra = len(present - set(manifest))
    print(f"manifest: entries={len(manifest)} mismatched={bad} unlisted={extra}")
    return 0 if bad == 0 and extra == 0 and manifest else 1


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: verify-manifest.py <set dir>")
    sys.exit(main(sys.argv[1]))
