#!/usr/bin/env python3
"""Phase 14B reviewer-gate regression: the ACTUAL startup configuration fails closed.

Runs the pinned Caddy image with the real deploy/Caddyfile.review and deploy/review-site.caddy on a
loopback-only throwaway port, once per gate variant, and polls from the moment the container starts:

- a valid gate answers 401 to anonymous requests from its very first response (no unprotected
  window during startup), admits the reviewer, and cannot be reloaded at runtime (admin off);
- a missing, empty, unwrapped, misnamed or plaintext gate makes Caddy refuse to start, and the port
  never serves a response;
- an empty snippet is accepted by Caddy itself, so it must be (and is) refused by staging.py's
  format check, and would be refused by the post-start gate probe;
- Compose refuses to create the proxy when the gate file is missing instead of mounting a directory;
- the future VPS configuration (Caddyfile.review-public, compose.public.yml) fails closed the same
  way, checked offline (no network, no ACME, no published port): every invalid gate fails
  `caddy validate`, the valid one adapts with authentication before every reverse proxy, and the
  public overlay refuses a missing gate, public Caddyfile or domain/ACME settings.

Every gate variant is also checked against staging.py's validator. Uses only throwaway containers
(removed with their anonymous volumes) and a throwaway Compose project whose resources are removed afterwards. Needs Docker.
"""
from pathlib import Path
import json
import os
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
DEPLOY = ROOT / 'deploy'
PORT = 3499
NAME = 'docversity14b-gate-regression'
CHECK_PROJECT = 'docversity14b-gatecheck'
CADDY = next(line.split('image:', 1)[1].strip() for line in (DEPLOY / 'compose.yml').read_text().splitlines() if 'image: caddy:' in line)
HASH = None  # Generated once with the image's own bcrypt (synthetic password, never reused).
sys.path.insert(0, str(Path(__file__).parent))


def run(*args, **kwargs):
    return subprocess.run(args, capture_output=True, text=True, **kwargs)


def http_status(path='/', authorization=None):
    """Status code, or None when nothing answers. Status-only probe of a throwaway local container
    whose CA lives and dies with it, so the certificate is not validated here (TLS validation is
    covered by the staging smoke tests)."""
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    try:
        with socket.create_connection(('127.0.0.1', PORT), timeout=2) as raw, context.wrap_socket(raw, server_hostname='localhost') as tls:
            headers = f'GET {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n'
            if authorization:
                headers += f'Authorization: {authorization}\r\n'
            tls.sendall((headers + '\r\n').encode())
            line = tls.recv(64).split(b'\r\n', 1)[0].decode()
            return int(line.split()[1])
    except (OSError, ssl.SSLError, ValueError, IndexError):
        return None


def basic(user, password):
    import base64
    return 'Basic ' + base64.b64encode(f'{user}:{password}'.encode()).decode()


def start(gate_file):
    mounts = ['-v', f'{DEPLOY / "Caddyfile.review"}:/etc/caddy/Caddyfile:ro', '-v', f'{DEPLOY / "review-site.caddy"}:/etc/caddy/review-site.caddy:ro']
    if gate_file:
        mounts += ['-v', f'{gate_file}:/etc/caddy/review-gate.caddy:ro']
    run('docker', 'rm', '-f', '-v', NAME)
    # Not --rm: an exited container's logs are read before it is removed (with its anonymous volumes).
    result = run('docker', 'run', '-d', '--name', NAME, '-p', f'127.0.0.1:{PORT}:443', *mounts, CADDY, check=True)
    return result.stdout.strip()


def watch(seconds, authorization=None):
    """Poll anonymously (or with credentials) from container start; return the observed statuses."""
    observed = []
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        observed.append(http_status('/', authorization))
        time.sleep(0.05)
    return observed


def running():
    return run('docker', 'inspect', '-f', '{{.State.Running}}', NAME).stdout.strip() == 'true'


def gate_variants(directory):
    directory = Path(tempfile.mkdtemp(dir=directory))  # A fresh set of read-only files per call.
    valid = f'(reviewer_gate) {{\n\tbasic_auth @gated {{\n\t\treviewer {HASH}\n\t}}\n}}\n'
    variants = {
        'valid': valid,
        'missing': None,
        'empty': '',
        'unwrapped (draft format)': f'basic_auth @gated {{\n\treviewer {HASH}\n}}\n',
        'misnamed snippet': valid.replace('(reviewer_gate)', '(review_gate)'),
        'plaintext password': valid.replace(HASH, 'synthetic-plaintext'),
        'empty snippet': '(reviewer_gate) {\n}\n',
    }
    files = {}
    for name, content in variants.items():
        if content is None:
            files[name] = None
            continue
        path = directory / f'{len(files)}.caddy'
        path.write_text(content)
        path.chmod(0o444)
        files[name] = path
    return files


def compose_refuses_missing_gate(directory):
    """The real Compose files with dummy (non-secret) files: no gate file → create fails."""
    copy = Path(directory) / 'checkout'
    shutil.copytree(DEPLOY, copy / 'deploy')
    shutil.copytree(ROOT / 'docker' / 'minio', copy / 'docker' / 'minio')
    secrets = copy / '.local' / 'staging'
    secrets.mkdir(parents=True)
    for name in ['runtime', 'worker_runtime', 'web_runtime', 'migration_runtime', 'database_bootstrap_password', 'database_owner_password', 'database_app_password', 'redis_config', 'redis_password', 'minio', 'reviewers.json', 'local-ca.crt', 'fixture.json']:
        (secrets / name).write_text('synthetic placeholder\n')
    files = ['-f', str(copy / 'deploy/compose.yml'), '-f', str(copy / 'deploy/compose.review.yml')]
    env = dict(os.environ, STAGING_PROJECT=CHECK_PROJECT, HTTPS_PORT='3498')
    try:
        missing = run('docker', 'compose', '-p', CHECK_PROJECT, *files, 'up', '--no-start', '--no-deps', '--no-build', 'proxy', env=env)
        created_dir = (secrets / 'review_gate.caddy').exists()
        (secrets / 'review_gate.caddy').write_text('(reviewer_gate) {\n}\n')
        present = run('docker', 'compose', '-p', CHECK_PROJECT, *files, 'up', '--no-start', '--no-deps', '--no-build', 'proxy', env=env)
        return missing, created_dir, present
    finally:
        run('docker', 'compose', '-p', CHECK_PROJECT, *files, 'down', '--volumes', '--remove-orphans', env=env)


def caddy_public(gate_file, command):
    """The VPS configuration, offline: `caddy validate|adapt` with no network (no ACME, no ports)."""
    mounts = ['-v', f'{DEPLOY / "Caddyfile.review-public"}:/etc/caddy/Caddyfile:ro', '-v', f'{DEPLOY / "review-site.caddy"}:/etc/caddy/review-site.caddy:ro']
    if gate_file:
        mounts += ['-v', f'{gate_file}:/etc/caddy/review-gate.caddy:ro']
    return run('docker', 'run', '--rm', '--network', 'none', '-e', 'PUBLIC_DOMAIN=staging.example.invalid', '-e', 'ACME_EMAIL=operator@example.invalid',
               *mounts, CADDY, 'caddy', command, '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile')


def public_route_order(adapted):
    """In the public site's routes, authentication precedes every reverse proxy, robots.txt excepted."""
    config = json.loads(adapted)
    for server in config['apps']['http']['servers'].values():
        for route in server.get('routes', []):
            hosts = [h for m in route.get('match', []) for h in m.get('host', [])]
            if 'staging.example.invalid' not in hosts:
                continue
            text = json.dumps(route)
            return ('"authentication"' in text and HASH in text
                    and text.index('"authentication"') < text.index('"reverse_proxy"')
                    and '"/robots.txt"' in text)
    return False


def compose_public_refusals(directory):
    """The VPS Compose overlay refuses a missing gate, a missing public Caddyfile or missing settings."""
    copy = Path(directory) / 'public-checkout'
    shutil.copytree(DEPLOY, copy / 'deploy')
    shutil.copytree(ROOT / 'docker' / 'minio', copy / 'docker' / 'minio')
    secrets = copy / '.local' / 'staging'
    secrets.mkdir(parents=True)
    for name in ['runtime', 'worker_runtime', 'web_runtime', 'migration_runtime', 'database_bootstrap_password', 'database_owner_password', 'database_app_password', 'redis_config', 'redis_password', 'minio', 'reviewers.json', 'local-ca.crt', 'fixture.json']:
        (secrets / name).write_text('synthetic placeholder\n')
    files = ['-f', str(copy / 'deploy/compose.yml'), '-f', str(copy / 'deploy/compose.review.yml'), '-f', str(copy / 'deploy/compose.public.yml')]
    base = dict(os.environ, STAGING_PROJECT=CHECK_PROJECT)
    full = dict(base, PUBLIC_DOMAIN='staging.example.invalid', ACME_EMAIL='operator@example.invalid')
    create = lambda env: run('docker', 'compose', '-p', CHECK_PROJECT, *files, 'up', '--no-start', '--no-deps', '--no-build', 'proxy', env=env)
    try:
        results = {'no PUBLIC_DOMAIN/ACME_EMAIL': create(base).returncode, 'no gate file': create(full).returncode}
        (secrets / 'review_gate.caddy').write_text('(reviewer_gate) {\n}\n')
        (copy / 'deploy/Caddyfile.review-public').unlink()
        results['no public Caddyfile'] = create(full).returncode
        results['host paths created'] = (copy / 'deploy/Caddyfile.review-public').exists()
        # Even a fully specified public overlay only creates the proxy here; nothing is started.
        return results
    finally:
        run('docker', 'compose', '-p', CHECK_PROJECT, *files, 'down', '--volumes', '--remove-orphans', env=full)


def main():
    global HASH
    import staging  # Layer 1: the same validator staging.py applies before starting anything.
    HASH = run('docker', 'run', '--rm', '-i', '--network', 'none', CADDY, 'caddy', 'hash-password', input='synthetic-regression-password\n', check=True).stdout.strip().splitlines()[-1]
    results = []
    failures = []
    with tempfile.TemporaryDirectory() as directory:
        for name, path in gate_variants(directory).items():
            if path is not None:
                original = staging.GATE
                staging.GATE = path
                problem = staging.gate_problem()
                staging.GATE = original
                validator = problem or 'accepted'
            else:
                validator = 'missing'
            start(path)
            observed = watch(6)
            alive = running()
            logs = run('docker', 'logs', NAME).stderr + run('docker', 'logs', NAME).stdout
            answered = sorted({s for s in observed if s is not None})
            row = {'variant': name, 'staging.py validator': validator, 'caddy running': alive, 'anonymous statuses seen': answered}
            if name == 'valid':
                row['reviewer status'] = http_status('/', basic('reviewer', 'synthetic-regression-password'))
                row['wrong password'] = http_status('/', basic('reviewer', 'wrong'))
                row['robots.txt'] = http_status('/robots.txt')
                reload = run('docker', 'exec', NAME, 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile')
                row['runtime reload'] = 'refused' if reload.returncode else 'ACCEPTED'
                ok = (validator == 'accepted' and alive and answered == [401] and observed.count(401) > 0
                      and row['reviewer status'] == 502 and row['wrong password'] == 401
                      and row['robots.txt'] == 200 and row['runtime reload'] == 'refused')
            elif name == 'empty snippet':
                # Caddy cannot detect a gate with no rules: the format check (and the live probe) must.
                ok = validator != 'accepted'
                row['note'] = 'Caddy alone would serve unprotected; refused by staging.py before start and by the post-start probe'
            else:
                exit_code = run('docker', 'inspect', '-f', '{{.State.ExitCode}}', NAME).stdout.strip()
                row['caddy exit code'] = int(exit_code) if exit_code.isdigit() else exit_code
                row['caddy last log'] = (logs.strip().splitlines() or [''])[-1][:160]
                ok = validator != 'accepted' and not alive and answered == [] and row['caddy exit code'] not in (0, '')
            row['result'] = 'PASS' if ok else 'FAIL'
            if not ok:
                failures.append(name)
            results.append(row)
            run('docker', 'rm', '-f', '-v', NAME)
        # Future VPS configuration (offline): same gate variants against Caddyfile.review-public.
        for name, path in gate_variants(directory).items():
            validated = caddy_public(path, 'validate')
            row = {'variant': f'public (VPS) config: {name}', 'caddy validate exit': validated.returncode}
            if name == 'valid':
                adapted = caddy_public(path, 'adapt')
                row['authentication before reverse_proxy'] = adapted.returncode == 0 and public_route_order(adapted.stdout)
                ok = validated.returncode == 0 and row['authentication before reverse_proxy']
            elif name == 'empty snippet':
                ok = True  # Caddy accepts it (as locally); staging.py and the post-start probe refuse it.
                row['note'] = 'refused by staging.py validator and post-start probe, as for the local config'
            else:
                ok = validated.returncode != 0
            row['result'] = 'PASS' if ok else 'FAIL'
            if not ok:
                failures.append(row['variant'])
            results.append(row)
        public = compose_public_refusals(directory)
        public_ok = all(code != 0 for key, code in public.items() if key != 'host paths created') and not public['host paths created']
        results.append({'variant': 'public compose overlay refusals', **public, 'result': 'PASS' if public_ok else 'FAIL'})
        if not public_ok:
            failures.append('public compose')
        missing, created_dir, present = compose_refuses_missing_gate(directory)
        compose_ok = missing.returncode != 0 and not created_dir and present.returncode == 0
        results.append({'variant': 'compose create without gate file', 'exit': missing.returncode, 'host path created': created_dir,
                        'error': next((l for l in missing.stderr.splitlines() if 'review_gate' in l or 'bind' in l), missing.stderr.strip()[-160:])[:200],
                        'control with gate file exit': present.returncode, 'result': 'PASS' if compose_ok else 'FAIL'})
        if not compose_ok:
            failures.append('compose')
    print(json.dumps(results, indent=2))
    if failures:
        raise SystemExit(f'FAIL: reviewer gate regression: {failures}')
    print(f'PASS: reviewer gate fails closed in local and VPS configurations ({len(results)} checks); valid local gate answers 401 from first response')


if __name__ == '__main__':
    main()
