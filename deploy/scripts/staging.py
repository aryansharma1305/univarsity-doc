#!/usr/bin/env python3
"""Fixed local-only projects. Never accepts a database URL, bucket, project or remote host."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
BACKUPS = ROOT / '.local/backups'
PROJECT = 'docversity14a'
RESTORE = 'docversity14a-restore'


def require_local_engine():
    override = os.environ.get('DOCKER_HOST') if not os.environ.get('DOCKER_CONTEXT') else None
    endpoint = override or subprocess.check_output(['docker', 'context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], text=True).strip()
    if not endpoint.startswith('unix://'):
        raise SystemExit('Local staging requires a Unix-socket Docker engine; remote contexts are refused')


def compose(*args, project=PROJECT, **kwargs):
    kwargs.setdefault('env', dict(os.environ, LOCAL_UID=str(os.getuid()), LOCAL_GID=str(os.getgid())))
    return subprocess.run(['docker', 'compose', '--project-name', project, '-f', str(ROOT / 'deploy/compose.yml'), *args], cwd=ROOT, check=True, **kwargs)


def manifest(directory):
    return {str(p.relative_to(directory)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(directory.rglob('*')) if p.is_file() and p.name != 'manifest.json'}


def backup():
    BACKUPS.mkdir(exist_ok=True, mode=0o700)
    directory = BACKUPS / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    directory.mkdir(mode=0o700)
    # Stop all app writers for a coherent database + object snapshot. Redis queues drain first.
    compose('stop', 'proxy', 'web', 'api')
    compose('stop', 'worker')
    try:
        with (directory / 'database.dump').open('wb') as output:
            compose('exec', '-T', 'postgres', 'pg_dump', '-U', 'docversity_owner', '-d', 'docversity_staging', '--format=custom', '--no-owner', '--no-acl', stdout=output)
        compose('run', '--rm', '--no-deps', 'storage-tools', 'mirror', 'local/docversity-staging', f'/backups/{directory.name}/objects')
        (directory / 'manifest.json').write_text(json.dumps(manifest(directory), indent=2))
        for p in directory.rglob('*'):
            p.chmod(0o700 if p.is_dir() else 0o600)
    finally:
        compose('up', '--no-build', '-d', '--wait')
    print(f'Consistent synthetic backup: {directory.name}')


def restore_test(name):
    if not name or '/' in name or name.startswith('.'):
        raise SystemExit('Use one backup directory name, never an arbitrary path')
    directory = BACKUPS / name
    expected = json.loads((directory / 'manifest.json').read_text())
    if expected != manifest(directory):
        raise SystemExit('Backup integrity mismatch')
    # Fresh volumes only. A second invocation refuses to overwrite a previous recovery rehearsal.
    existing = subprocess.check_output(['docker', 'volume', 'ls', '-q'], text=True)
    if any(name.startswith(RESTORE + '_') for name in existing.splitlines()):
        raise SystemExit('Restore-test volumes already exist; refusing to overwrite them')
    compose('up', '-d', '--wait', 'postgres', 'minio', project=RESTORE)
    with (directory / 'database.dump').open('rb') as source:
        compose('exec', '-T', 'postgres', 'pg_restore', '-U', 'docversity_owner', '-d', 'docversity_staging', '--exit-on-error', '--no-owner', '--no-acl', project=RESTORE, stdin=source)
    compose('run', '--rm', '--no-deps', 'storage-tools', 'mirror', f'/backups/{name}/objects', 'local/docversity-staging', project=RESTORE)
    # Restored owner differs from runtime principal; re-apply grants without changing records.
    compose('exec', '-T', 'postgres', 'psql', '-U', 'docversity_owner', '-d', 'docversity_staging', '-v', 'ON_ERROR_STOP=1', '-c', 'GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO docversity_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO docversity_app;', project=RESTORE)
    def database_fingerprint(project):
        def query(sql):
            return subprocess.check_output(['docker','compose','-p',project,'-f',str(ROOT/'deploy/compose.yml'),'exec','-T','postgres','psql','-U','docversity_owner','-d','docversity_staging','-Atc',sql], text=True).strip()
        tables = query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").splitlines()
        result = {}
        for table in tables:
            identifier = table.replace('"', '""')
            result[table] = query(f"SELECT count(*), md5(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text))) FROM public.\"{identifier}\" t")
        return result
    if database_fingerprint(PROJECT) != database_fingerprint(RESTORE):
        raise SystemExit('Restored database content differs')
    # Copy recovery objects out separately and compare every byte with the backup.
    compose('run', '--rm', '--no-deps', 'storage-tools', 'mirror', 'local/docversity-staging', f'/backups/restored-{name}', project=RESTORE)
    first = manifest(directory / 'objects')
    if first != manifest(BACKUPS / f'restored-{name}'):
        raise SystemExit('Restored objects differ')
    compose('run', '--rm', '--no-deps', 'tools', 'node', '/operations/verify-restore.mjs', project=RESTORE)
    print('Recovery verified: all database table fingerprints and every object SHA-256 match. Recovery volumes retained for inspection.')


if __name__ == '__main__':
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['up','stop','status','build','fixture','smoke','backup','restore-test'])
    parser.add_argument('backup_name', nargs='?')
    args = parser.parse_args()
    require_local_engine()
    if args.action == 'backup': backup()
    elif args.action == 'restore-test': restore_test(args.backup_name)
    elif args.action == 'up': compose('up','--no-build','-d','--wait')
    elif args.action == 'stop': compose('stop')
    elif args.action == 'status': compose('ps')
    elif args.action == 'build': compose('build')
    elif args.action == 'fixture':
        compose('run','--rm','--no-deps','tools','node','/operations/fixture.mjs')
        compose('run','--rm','--no-deps','storage-tools','mb','--ignore-existing','local/docversity-staging-canary')
        compose('run','--rm','--no-deps','storage-tools','anonymous','set','none','local/docversity-staging-canary')
    else: compose('run','--rm','--no-deps','tools','node','/operations/smoke.mjs')
