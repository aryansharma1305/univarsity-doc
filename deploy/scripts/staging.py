#!/usr/bin/env python3
"""Fixed local-only projects. Never accepts a database URL, bucket, project or remote host."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
BACKUPS = ROOT / '.local/backups'
SECRETS = ROOT / '.local/staging'
# Written once by init-local.py. Without it (Phase 14A layout) the original fixed project applies.
_instance_file = SECRETS / 'instance.json'
INSTANCE = json.loads(_instance_file.read_text()) if _instance_file.exists() else {'project': 'docversity14a', 'httpsPort': 3443, 'public': False}
PROJECT = INSTANCE['project']
if not re.fullmatch(r'docversity14[a-z]', PROJECT):
    raise SystemExit('Unexpected staging project name')
RESTORE = PROJECT + '-restore'
# Phase 14B review overlays. Every instance other than Phase 14A's fixed local stack, and every public
# host, REQUIRES the reviewer gate: without a valid gate file nothing is started (fail closed).
GATE = SECRETS / 'review_gate.caddy'
GATE_FORMAT = re.compile(r'\(reviewer_gate\) \{\n\tbasic_auth @gated \{\n\t\t[a-z]{3,32} \$2[aby]\$1[0-9]\$[./A-Za-z0-9]{53}\n\t\}\n\}\n')
def gate_required(instance):
    return instance['project'] != 'docversity14a' or bool(instance.get('public'))


GATE_REQUIRED = gate_required(INSTANCE)
OVERLAYS = ['compose.review.yml'] if GATE_REQUIRED or GATE.exists() else []
if INSTANCE.get('public'):
    OVERLAYS.append('compose.public.yml')


def gate_problem():
    """Why the reviewer gate file cannot be trusted, or None. Never reveals its contents."""
    if GATE.is_symlink() or not GATE.exists():
        return 'missing'
    if not GATE.is_file():
        return 'not a regular file'
    if GATE.stat().st_mode & 0o222:
        return 'writable (expected read-only 0444)'
    if not GATE_FORMAT.fullmatch(GATE.read_text()):
        return 'invalid format (expected the reviewer_gate snippet with one bcrypt user)'
    return None


def require_gate():
    problem = gate_problem() if 'compose.review.yml' in OVERLAYS else None
    if problem:
        raise SystemExit(f'Reviewer gate {problem}; refusing to start staging (run review-init)')


def require_local_engine():
    override = os.environ.get('DOCKER_HOST') if not os.environ.get('DOCKER_CONTEXT') else None
    endpoint = override or subprocess.check_output(['docker', 'context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], text=True).strip()
    if not endpoint.startswith('unix://'):
        raise SystemExit('Local staging requires a Unix-socket Docker engine; remote contexts are refused')


def instance_environment():
    values = {'LOCAL_UID': str(os.getuid()), 'LOCAL_GID': str(os.getgid()), 'STAGING_PROJECT': PROJECT, 'HTTPS_PORT': str(INSTANCE['httpsPort'])}
    if INSTANCE.get('public'):
        values.update(PUBLIC_DOMAIN=INSTANCE['origin'].removeprefix('https://'), ACME_EMAIL=INSTANCE['acmeEmail'])
    return values


def review_init():
    """Hash the reviewer gate password with Caddy's bcrypt; the plaintext never reaches argv or logs."""
    target = SECRETS / 'review_gate.caddy'
    if target.exists():
        raise SystemExit('Reviewer gate already exists; refusing to overwrite.')
    gate = json.loads((SECRETS / 'reviewers.json').read_text())['gate']
    caddy = next(line.split('image:', 1)[1].strip() for line in (ROOT / 'deploy/compose.yml').read_text().splitlines() if 'image: caddy:' in line)
    hashed = subprocess.run(['docker', 'run', '--rm', '-i', '--network', 'none', caddy, 'caddy', 'hash-password'], input=gate['password'] + '\n', capture_output=True, text=True, check=True).stdout.strip().splitlines()[-1]
    if not re.fullmatch(r'\$2[aby]\$1[0-9]\$[./A-Za-z0-9]{53}', hashed) or not re.fullmatch(r'[a-z]{3,32}', gate['username']):
        raise SystemExit('Unexpected reviewer gate hash or username')
    target.write_text(f"(reviewer_gate) {{\n\tbasic_auth @gated {{\n\t\t{gate['username']} {hashed}\n\t}}\n}}\n")
    target.chmod(0o444)
    print('Reviewer gate created; credentials remain in the private staging directory.')


def up():
    """Start (or reconcile) the stack, then prove the gate from inside the backend network."""
    require_gate()
    compose('up', '--no-build', '-d', '--wait')
    if 'compose.review.yml' in OVERLAYS:
        verify_gate()


def export_ca():
    # Export only Caddy's public local root (and intermediate) certificates for trusted HTTPS clients.
    for name in ['root', 'intermediate']:
        target = SECRETS / ('local-ca.crt' if name == 'root' else 'local-ca-intermediate.crt')
        compose('cp', f'proxy:/data/caddy/pki/authorities/local/{name}.crt', str(target))
        target.chmod(0o644)


def verify_gate():
    if not INSTANCE.get('public'):
        export_ca()
    # Anonymous and wrong-credential requests must be refused on every route class. On any failure
    # the proxy (the only published service) is stopped, so nothing stays reachable unprotected.
    try:
        compose('run', '--rm', '--no-deps', 'tools', 'node', '/operations/gate-check.mjs')
    except subprocess.CalledProcessError:
        compose('stop', 'proxy')
        raise SystemExit('Reviewer gate check failed; proxy stopped (fail closed)')


def compose_files():
    return [arg for name in ['compose.yml', *OVERLAYS] for arg in ('-f', str(ROOT / 'deploy' / name))]


def compose(*args, project=PROJECT, **kwargs):
    kwargs.setdefault('env', dict(os.environ, **instance_environment()))
    return subprocess.run(['docker', 'compose', '--project-name', project, *compose_files(), *args], cwd=ROOT, check=True, **kwargs)


def manifest(directory):
    return {str(p.relative_to(directory)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(directory.rglob('*')) if p.is_file() and p.name != 'manifest.json'}


def backup():
    require_gate()  # Never stop and restart a stack whose reviewer gate is not valid.
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
        up()
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
            return subprocess.check_output(['docker','compose','-p',project,*compose_files(),'exec','-T','postgres','psql','-U','docversity_owner','-d','docversity_staging','-Atc',sql], text=True).strip()
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
    parser.add_argument('action', choices=['up','stop','status','build','fixture','smoke','backup','restore-test','ca','review-init','review-fixture'])
    parser.add_argument('backup_name', nargs='?')
    args = parser.parse_args()
    require_local_engine()
    if args.action not in ('review-init', 'stop', 'status', 'build'):
        require_gate()
    if args.action == 'review-init': review_init()
    elif args.action == 'ca': export_ca()
    elif args.action == 'review-fixture':
        if 'compose.review.yml' not in OVERLAYS:
            raise SystemExit('Run review-init before creating reviewer accounts')
        compose('run','--rm','--no-deps','tools','node','/operations/review-fixture.mjs')
    elif args.action == 'backup': backup()
    elif args.action == 'restore-test': restore_test(args.backup_name)
    elif args.action == 'up': up()
    elif args.action == 'stop': compose('stop')
    elif args.action == 'status': compose('ps')
    elif args.action == 'build': compose('build')
    elif args.action == 'fixture':
        compose('run','--rm','--no-deps','tools','node','/operations/fixture.mjs')
        compose('run','--rm','--no-deps','storage-tools','mb','--ignore-existing','local/docversity-staging-canary')
        compose('run','--rm','--no-deps','storage-tools','anonymous','set','none','local/docversity-staging-canary')
    else: compose('run','--rm','--no-deps','tools','node','/operations/smoke.mjs')
