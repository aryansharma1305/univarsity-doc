#!/usr/bin/env python3
"""Exact-SHA image rollback rehearsal on a fresh GitHub-hosted synthetic stack only."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile

import staging

ROLES = ('api', 'worker', 'web', 'tools')
OUTPUT = staging.ROOT / 'test-results/release'
MIGRATIONS = Path('packages/database/prisma/migrations')


def command(*args, **kwargs):
    return subprocess.check_output(args, text=True, timeout=60, **kwargs).strip()


def require_isolated_runner():
    if os.environ.get('GITHUB_ACTIONS') != 'true' or os.environ.get('RUNNER_ENVIRONMENT') != 'github-hosted':
        raise SystemExit('Release rehearsal requires a fresh GitHub-hosted runner')
    if staging.PROJECT != 'docversity14a' or staging.INSTANCE.get('public') or staging.INSTANCE.get('origin') != 'https://localhost:3443':
        raise SystemExit('Only the synthetic loopback CI instance is allowed')
    staging.require_local_engine()
    staging.require_gate()
    if 'compose.review.yml' not in staging.OVERLAYS:
        raise SystemExit('The reviewer gate must be enabled')
    sha = os.environ.get('IMAGE_TAG', '')
    if not re.fullmatch(r'[a-f0-9]{40}', sha) or sha != command('git', '-C', str(staging.ROOT), 'rev-parse', 'HEAD'):
        raise SystemExit('Image tag must match the exact checked-out candidate SHA')
    return sha


def candidate_migrations(sha):
    files = command(
        'git', '-C', str(staging.ROOT), 'ls-tree', '-rz', '--name-only', sha, '--', str(MIGRATIONS),
    )
    paths = (Path(name) for name in files.split('\0') if name)
    names = sorted(
        path.parent.name for path in paths
        if path.name == 'migration.sql' and path.parent.parent == MIGRATIONS
    )
    if not names:
        raise SystemExit('Candidate contains no Prisma migrations')
    return names


def require_complete_migrations(expected, history):
    incomplete = [
        name for name, finished, rolled_back, failed in history
        if not finished or rolled_back or failed
    ]
    if incomplete:
        raise SystemExit(f'Failed, rolled-back or unfinished Prisma migrations: {incomplete}')
    applied = sorted(row[0] for row in history)
    if applied != expected:
        raise SystemExit(
            f'Applied Prisma migration names must exactly match the candidate. Expected {expected}, got {applied}'
        )


def fingerprint():
    def query(sql):
        return staging.compose('exec', '-T', 'postgres', 'psql', '-X', '-U', 'docversity_owner', '-d', 'docversity_staging', '-v', 'ON_ERROR_STOP=1', '-Atc', sql, capture_output=True, text=True).stdout.strip()
    tables = query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").splitlines()
    result = {}
    for table in tables:
        identifier = table.replace('"', '""')
        result[table] = query(f"SELECT count(*), md5(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text))) FROM public.\"{identifier}\" t")
    history = json.loads(query("""
        SELECT COALESCE(json_agg(json_build_array(
            migration_name, finished_at IS NOT NULL, rolled_back_at IS NOT NULL, logs IS NOT NULL
        ) ORDER BY migration_name, id), '[]'::json)
        FROM public._prisma_migrations
    """))
    return result, history


def image(reference):
    value = json.loads(command('docker', 'image', 'inspect', '--format', '{"id":{{json .Id}},"architecture":{{json .Architecture}},"os":{{json .Os}},"repoDigests":{{json .RepoDigests}}}', reference))
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', value['id']) or value['architecture'] != 'amd64' or value['os'] != 'linux':
        raise SystemExit('Expected an immutable linux/amd64 image identity')
    return {'reference': reference, **value}


def main():
    sha = require_isolated_runner()
    expected_migrations = candidate_migrations(sha)
    images = {role: image(f'{staging.PROJECT}-{role}:{sha}') for role in ROLES}
    before, migrations = fingerprint()
    require_complete_migrations(expected_migrations, migrations)
    fault = 'fault-' + sha
    # A wrong-role web image simulates a broken release. Known-good SHA tags never move.
    for role in ROLES:
        source = images['worker' if role == 'web' else role]['id']
        subprocess.run(['docker', 'image', 'tag', source, f'{staging.PROJECT}-{role}:{fault}'], check=True)
    fault_failed = False
    proxy_remained_stopped = False
    try:
        staging.compose('stop')
        try:
            result = subprocess.run(['timeout', '--kill-after=5s', '90s', 'python3', str(staging.ROOT / 'deploy/scripts/staging.py'), 'up'], env=dict(os.environ, IMAGE_TAG=fault), capture_output=True, text=True, timeout=110)
            fault_failed = result.returncode != 0
        except subprocess.TimeoutExpired:
            fault_failed = True
        proxy_remained_stopped = not staging.compose('ps', '--status', 'running', '--quiet', 'proxy', capture_output=True, text=True).stdout.strip()
    finally:
        # Stop only this CI project's failed containers and restore the retained good images.
        staging.compose('stop')
        staging.up()
    if not fault_failed or not proxy_remained_stopped:
        raise SystemExit('Broken image was accepted or its proxy became reachable')
    after, after_migrations = fingerprint()
    if before != after or migrations != after_migrations:
        raise SystemExit('Image rollback changed persisted synthetic records')
    for role in ('api', 'worker', 'web'):
        container = staging.compose('ps', '--quiet', role, capture_output=True, text=True).stdout.strip()
        if command('docker', 'inspect', '--format', '{{.Image}}', container) != images[role]['id']:
            raise SystemExit('Rollback did not restore the retained image identity')
    staging.compose('run', '--rm', '--no-deps', 'tools', 'node', '/operations/verify-restore.mjs')
    staging.compose('run', '--rm', '--no-deps', 'tools', 'node', '/operations/smoke.mjs')
    OUTPUT.mkdir(parents=True, exist_ok=False)
    metadata = {'commit': sha, 'runId': os.environ['GITHUB_RUN_ID'], 'architecture': 'linux/amd64', 'images': images, 'registryPublished': False}
    (OUTPUT / 'images.json').write_text(json.dumps(metadata, indent=2) + '\n')
    rehearsal = {
        'commit': sha,
        'brokenImageRefused': fault_failed,
        'failedProxyStayedStopped': proxy_remained_stopped,
        'retainedImageIdsRestored': True,
        'tableFingerprintsEqual': True,
        'tablesCompared': len(before),
        'migrations': f'{len(expected_migrations)}|0',
        'migrationNames': expected_migrations,
        'privateObjectsReadable': True,
        'productionSmokePassed': True,
        'scope': 'Same-schema image-assignment failure and rollback; not downgrade or cross-version migration compatibility',
    }
    (OUTPUT / 'rehearsal.json').write_text(json.dumps(rehearsal, indent=2) + '\n')
    if shutil.disk_usage(OUTPUT).free < 4 * 1024**3:
        raise SystemExit('Insufficient disk headroom for the release archive')
    archive = OUTPUT / 'images.tar.gz'
    with archive.open('wb') as target:
        save = subprocess.Popen(['docker', 'image', 'save', *(value['reference'] for value in images.values())], stdout=subprocess.PIPE)
        try:
            zipped = subprocess.run(['gzip', '-1'], stdin=save.stdout, stdout=target, timeout=300)
            save.stdout.close()
            if zipped.returncode != 0 or save.wait(timeout=30) != 0:
                raise SystemExit('Image archive failed')
        finally:
            if save.poll() is None:
                save.kill()
                save.wait()
    # Verify exported config digests without extracting the archive to disk.
    with tarfile.open(archive, 'r:gz') as bundle:
        manifest_file = bundle.extractfile('manifest.json')
        if manifest_file is None:
            raise SystemExit('Docker image manifest missing')
        manifests = json.loads(manifest_file.read(1024 * 1024))
        for value in images.values():
            entry = next(item for item in manifests if value['reference'] in item.get('RepoTags', []))
            config = bundle.extractfile(entry['Config'])
            if config is None or 'sha256:' + hashlib.sha256(config.read(1024 * 1024)).hexdigest() != value['id']:
                raise SystemExit('Exported image config digest differs')
    checksums = []
    for path in (OUTPUT / 'images.json', OUTPUT / 'rehearsal.json', archive):
        with path.open('rb') as source:
            digest = hashlib.file_digest(source, 'sha256').hexdigest()
        checksums.append(f'{digest}  {path.name}\n')
    (OUTPUT / 'SHA256SUMS').write_text(''.join(checksums))
    print('PASS: exact-SHA images, guarded same-schema rollback, unchanged synthetic data, private objects and verified image archive. No registry push or public deployment.')


if __name__ == '__main__':
    main()
