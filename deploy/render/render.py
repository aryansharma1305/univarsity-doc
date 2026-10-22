#!/usr/bin/env python3
"""Phase 14C operator tool for the temporary Render staging (Option B). Never prints a secret.

Local preparation only (no network, no cloud account):
  init                 generate private secrets and synthetic reviewer accounts in .local/render
  gate                 hash the reviewer-gate password with the pinned Caddy image (review_gate.caddy)
  assemble             validate .local/render/provider.env (values issued by Render and Cloudflare)
                       and write every service's Secret File under .local/render/secret-files
  window               show the review window; --start records go-live; --extend N --reason R extends

Live actions against the provisioned resources. They refuse to run without --authorized, which the
operator passes only after the project owner has approved provisioning:
  roles                role-probe.sql, then roles.sql, as the database administrator (G2)
  migrate              all Prisma migrations as docversity_owner (Phase 14B tools image)
  fixture              base and reviewer synthetic fixtures as the runtime role
  probe                post-deploy gate probe of the public edge; on failure the edge is suspended
  ip-probe             live client-IP check through Render's proxies (G3)
"""
from pathlib import Path
from datetime import datetime, timedelta, timezone
import argparse
import base64
import http.cookiejar
import json
import os
import re
import secrets
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
DIRECTORY = ROOT / '.local/render'
SECRET_FILES = DIRECTORY / 'secret-files'
OPERATOR = DIRECTORY / 'operator'
INSTANCE = DIRECTORY / 'instance.json'
PROVIDER = DIRECTORY / 'provider.env'
GATE = DIRECTORY / 'review_gate.caddy'
TOOLS = os.environ.get('RENDER_TOOLS_IMAGE', 'docversity14b-tools:local')
WINDOW_DAYS = 14
sys.path.insert(0, str(ROOT / 'deploy/scripts'))
import staging  # noqa: E402  (the Phase 14B gate validator and pinned Caddy image)

POSTGRES = next(line.split('image:', 1)[1].strip() for line in (ROOT / 'deploy/compose.yml').read_text().splitlines() if 'image: postgres:' in line)
CADDY = next(line.split('image:', 1)[1].strip() for line in (ROOT / 'deploy/compose.yml').read_text().splitlines() if 'image: caddy:' in line)
EDGE_IP = re.compile(r'(private_ranges|[0-9a-f.:]+/[0-9]{1,3})( (private_ranges|[0-9a-f.:]+/[0-9]{1,3}))*')
# Values issued by Render and Cloudflare. Every one is validated; nothing else is accepted.
PROVIDER_KEYS = {
    'EDGE_ORIGIN': re.compile(r'https://docversity14c-edge[a-z0-9-]*\.onrender\.com'),
    'EDGE_SERVICE_ID': re.compile(r'srv-[a-z0-9]{20,32}'),
    'WEB_PRIVATE_HOSTPORT': re.compile(r'docversity14c-web[a-z0-9-]*:3000'),
    'API_PRIVATE_HOSTPORT': re.compile(r'docversity14c-api[a-z0-9-]*:4000'),
    'DATABASE_INTERNAL_HOST': re.compile(r'dpg-[a-z0-9]{20,32}-a'),
    'DATABASE_EXTERNAL_HOST': re.compile(r'dpg-[a-z0-9]{20,32}-a\.singapore-postgres\.render\.com'),
    'DATABASE_ADMIN_USER': re.compile(r'[a-z_][a-z0-9_]{0,62}'),
    'DATABASE_ADMIN_PASSWORD': re.compile(r'[A-Za-z0-9]{16,128}'),
    'REDIS_INTERNAL_URL': re.compile(r'redis://red-[a-z0-9]{20,32}:6379'),
    'R2_ENDPOINT': re.compile(r'https://[0-9a-f]{32}(\.eu)?\.r2\.cloudflarestorage\.com'),
    'R2_BUCKET': re.compile(r'docversity14c-[a-z0-9-]{3,40}'),
    'R2_ACCESS_KEY_ID': re.compile(r'[0-9a-f]{32}'),
    'R2_SECRET_ACCESS_KEY': re.compile(r'[0-9a-f]{64}'),
    'RENDER_TRUSTED_PROXIES': EDGE_IP,
    'RENDER_CLIENT_IP_HEADER': re.compile(r'X-Forwarded-For|True-Client-IP|CF-Connecting-IP'),
}
WORKER_KEYS = {'NODE_ENV', 'LOG_LEVEL', 'DATABASE_URL', 'REDIS_URL', 'QUEUE_PREFIX', 'S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET',
               'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_FORCE_PATH_STYLE', 'WORKER_CONCURRENCY', 'IMPORT_CONCURRENCY'}


def write(path, text, mode=0o400):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.exists():
        path.chmod(0o600)
    path.write_text(text.rstrip() + '\n')
    path.chmod(mode)


def load(path):
    return json.loads(path.read_text())


def init():
    if DIRECTORY.exists():
        raise SystemExit('Render staging secrets already exist; refusing to overwrite.')
    DIRECTORY.mkdir(parents=True, mode=0o700)
    password = lambda: secrets.token_urlsafe(24)
    write(DIRECTORY / 'generated.json', json.dumps({key: secrets.token_hex(32) for key in ['owner', 'app', 'session']}))
    write(DIRECTORY / 'reviewers.json', json.dumps({
        'gate': {'username': 'reviewer', 'password': password()},
        'staff': [
            {'role': 'SUPER_ADMIN', 'email': 'review.admin@example.invalid', 'displayName': 'SYNTHETIC University Administrator (review)', 'password': password()},
            {'role': 'REGISTRAR', 'email': 'review.registrar@example.invalid', 'displayName': 'SYNTHETIC Registrar (review)', 'password': password()},
            {'role': 'EXAM_ADMIN', 'email': 'review.exams@example.invalid', 'displayName': 'SYNTHETIC Examination Staff (review)', 'password': password()},
        ],
        'student': {'registrationNumber': 'REVIEW-REG-1001', 'password': password()},
    }), 0o444)  # read inside the non-root tools container; the parent directory stays 0700
    write(DIRECTORY / 'fixture.json', json.dumps({'email': 'staging.admin@example.invalid', 'staffPassword': password(),
                                                  'registrationNumber': 'STAGING-REG-0001', 'studentPassword': password()}), 0o444)
    write(INSTANCE, json.dumps({'project': 'docversity14c', 'public': True, 'origin': None, 'windowDays': WINDOW_DAYS,
                                'windowStart': None, 'extensions': []}, indent=2), 0o600)
    write(PROVIDER, '\n'.join(f'{key}=' for key in PROVIDER_KEYS), 0o600)
    print(f'Generated Render staging secrets in {DIRECTORY.relative_to(ROOT)}; no credentials printed.')
    print(f'Next: gate, then fill {PROVIDER.relative_to(ROOT)} with the provider-issued values and run assemble.')


def gate():
    if GATE.exists():
        raise SystemExit('Reviewer gate already exists; refusing to overwrite.')
    reviewer = load(DIRECTORY / 'reviewers.json')['gate']
    hashed = subprocess.run(['docker', 'run', '--rm', '-i', '--network', 'none', CADDY, 'caddy', 'hash-password'],
                            input=reviewer['password'] + '\n', capture_output=True, text=True, check=True).stdout.strip().splitlines()[-1]
    write(GATE, f"(reviewer_gate) {{\n\tbasic_auth @gated {{\n\t\t{reviewer['username']} {hashed}\n\t}}\n}}\n", 0o444)
    require_gate()
    print('Reviewer gate created; credentials remain in the private Render directory.')


def require_gate():
    original, staging.GATE = staging.GATE, GATE
    try:
        problem = staging.gate_problem()
    finally:
        staging.GATE = original
    if problem:
        raise SystemExit(f'Reviewer gate {problem}; refusing (run gate)')


def provider_values():
    values = {}
    for number, line in enumerate(PROVIDER.read_text().splitlines(), 1):
        if not line.strip() or line.startswith('#'):
            continue
        key, separator, value = line.partition('=')
        if not separator or key not in PROVIDER_KEYS:
            raise SystemExit(f'provider.env line {number}: unknown or malformed entry')
        values[key] = value.strip()
    problems = [key for key, pattern in PROVIDER_KEYS.items() if not pattern.fullmatch(values.get(key, ''))]
    if problems:
        raise SystemExit(f"provider.env: missing or invalid {', '.join(problems)} (values not shown)")
    if not values['DATABASE_EXTERNAL_HOST'].startswith(values['DATABASE_INTERNAL_HOST'] + '.'):
        raise SystemExit('provider.env: internal and external database hosts are different databases')
    return values


def assemble():
    require_gate()
    v, generated = provider_values(), load(DIRECTORY / 'generated.json')
    origin = v['EDGE_ORIGIN']
    api_port = v['API_PRIVATE_HOSTPORT'].rsplit(':', 1)[1]
    runtime = {
        'NODE_ENV': 'production', 'LOG_LEVEL': 'log', 'API_HOST': '0.0.0.0', 'API_PORT': api_port,
        'WEB_URL': origin, 'CORS_ORIGINS': origin, 'SWAGGER_ENABLED': 'false',
        # Caddy hands Next.js exactly one X-Forwarded-For entry, so the 14B hop count holds unchanged.
        'TRUST_PROXY': '2', 'COOKIE_SECURE': 'true', 'SESSION_SECRET': generated['session'],
        'DATABASE_URL': f"postgresql://docversity_app:{generated['app']}@{v['DATABASE_INTERNAL_HOST']}:5432/docversity_staging",
        'REDIS_URL': v['REDIS_INTERNAL_URL'], 'REDIS_KEY_PREFIX': 'staging:', 'QUEUE_PREFIX': 'staging',
        'S3_ENDPOINT': v['R2_ENDPOINT'], 'S3_REGION': 'auto', 'S3_BUCKET': v['R2_BUCKET'],
        'S3_ACCESS_KEY': v['R2_ACCESS_KEY_ID'], 'S3_SECRET_KEY': v['R2_SECRET_ACCESS_KEY'], 'S3_FORCE_PATH_STYLE': 'true',
        'WORKER_CONCURRENCY': '1', 'IMPORT_CONCURRENCY': '1',
    }
    lines = lambda values: '\n'.join(f'{k}={value}' for k, value in values.items())
    write(SECRET_FILES / 'api/runtime', lines(runtime))
    write(SECRET_FILES / 'worker/runtime', lines({k: value for k, value in runtime.items() if k in WORKER_KEYS}))
    write(SECRET_FILES / 'web/web_runtime', lines({'NODE_ENV': 'production', 'API_INTERNAL_URL': f"http://{v['API_PRIVATE_HOSTPORT']}",
                                                   'WEB_BEHIND_TRUSTED_PROXY': 'true'}))
    write(SECRET_FILES / 'edge/review_gate.caddy', GATE.read_text())
    # Plain (non-secret) environment of the edge service.
    write(SECRET_FILES / 'edge/environment', lines({'PORT': '10000', 'RENDER_TRUSTED_PROXIES': v['RENDER_TRUSTED_PROXIES'],
                                                    'RENDER_CLIENT_IP_HEADER': v['RENDER_CLIENT_IP_HEADER'],
                                                    'WEB_UPSTREAM': v['WEB_PRIVATE_HOSTPORT'], 'API_UPSTREAM': v['API_PRIVATE_HOSTPORT']}))
    external = f"{v['DATABASE_EXTERNAL_HOST']}:5432/docversity_staging?sslmode=verify-full"
    write(OPERATOR / 'migration_runtime', f"DATABASE_URL=postgresql://docversity_owner:{generated['owner']}@{external}", 0o444)
    write(OPERATOR / 'fixture_runtime', lines({'NODE_ENV': 'production', 'WEB_URL': origin,
                                               'DATABASE_URL': f"postgresql://docversity_app:{generated['app']}@{external}"}), 0o444)
    instance = load(INSTANCE)
    instance['origin'] = origin
    write(INSTANCE, json.dumps(instance, indent=2), 0o600)
    print(f'Wrote Secret Files for edge, web, api and worker under {SECRET_FILES.relative_to(ROOT)}; no values printed.')


def window(start=False, extend=None, reason=None):
    instance = load(INSTANCE)
    now = datetime.now(timezone.utc)
    if start:
        if instance['windowStart']:
            raise SystemExit('Review window already started.')
        instance['windowStart'] = now.isoformat(timespec='seconds')
    if extend is not None:
        if not instance['windowStart'] or not reason or not 1 <= extend <= 14:
            raise SystemExit('Extend a started window by 1–14 days with a --reason.')
        instance['extensions'].append({'days': extend, 'reason': reason, 'at': now.isoformat(timespec='seconds')})
    if start or extend is not None:
        write(INSTANCE, json.dumps(instance, indent=2), 0o600)
    if not instance['windowStart']:
        print(f"Review window not started ({instance['windowDays']} days from go-live).")
        return None
    end = datetime.fromisoformat(instance['windowStart']) + timedelta(days=instance['windowDays'] + sum(e['days'] for e in instance['extensions']))
    remaining = end - now
    print(f"Review window: {instance['windowStart']} → {end.isoformat(timespec='seconds')} "
          f"({len(instance['extensions'])} extension(s)); "
          + (f'{remaining.days} day(s) {remaining.seconds // 3600} h left.' if remaining.total_seconds() > 0 else 'ENDED: tear down now (docs: Teardown).'))
    return end


def tools(*args, runtime, mounts=(), env=None):
    """Run the Phase 14B tools image locally with a runtime Secret File; secrets never reach argv."""
    volumes = [a for source, target in [(runtime, '/run/secrets/runtime'), *mounts] for a in ('-v', f'{source}:{target}:ro')]
    extra = [a for key in (env or {}) for a in ('-e', key)]
    return subprocess.run(['docker', 'run', '--rm', '--read-only', '--tmpfs', '/tmp', '--cap-drop', 'ALL', *extra, *volumes, TOOLS, *args],
                          env=dict(os.environ, **(env or {})), check=True)


def roles():
    v, generated = provider_values(), load(DIRECTORY / 'generated.json')
    connection = (f"host={v['DATABASE_EXTERNAL_HOST']} port=5432 dbname=docversity_staging user={v['DATABASE_ADMIN_USER']} "
                  'sslmode=verify-full sslrootcert=/etc/ssl/host-ca.pem')
    env = dict(os.environ, PGPASSWORD=v['DATABASE_ADMIN_PASSWORD'], OWNER_PASSWORD=generated['owner'], APP_PASSWORD=generated['app'])
    for script in ['role-probe.sql', 'roles.sql']:
        subprocess.run(['docker', 'run', '--rm', '-i', '-e', 'PGPASSWORD', '-e', 'OWNER_PASSWORD', '-e', 'APP_PASSWORD',
                        '-v', '/etc/ssl/cert.pem:/etc/ssl/host-ca.pem:ro', POSTGRES, 'psql', connection, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
                       input=(ROOT / 'deploy/render' / script).read_text(), text=True, env=env, check=True)


def fixture():
    host = provider_values()['DATABASE_EXTERNAL_HOST']
    mounts = [(ROOT / 'deploy/scripts', '/operations'), (DIRECTORY / 'fixture.json', '/credentials/fixture.json'),
              (DIRECTORY / 'reviewers.json', '/credentials/reviewers.json')]
    for script in ['fixture.mjs', 'review-fixture.mjs']:
        tools('node', f'/operations/{script}', runtime=OPERATOR / 'fixture_runtime', mounts=mounts, env={'STAGING_DATABASE_HOST': host})


def suspend_edge(service):
    key = os.environ.get('RENDER_API_KEY')
    if not key:
        raise SystemExit('FAIL: reviewer gate probe failed. SUSPEND the edge service in the Render dashboard NOW.')
    request = urllib.request.Request(f'https://api.render.com/v1/services/{service}/suspend', method='POST',
                                     headers={'Authorization': f'Bearer {key}', 'Accept': 'application/json'})
    urllib.request.urlopen(request, timeout=30)
    raise SystemExit('FAIL: reviewer gate probe failed; edge service suspended (fail closed).')


def probe():
    v = provider_values()
    origin = v['EDGE_ORIGIN']
    try:
        tools('node', '/operations/gate-check.mjs', runtime=OPERATOR / 'fixture_runtime',
              mounts=[(ROOT / 'deploy/scripts', '/operations'), (DIRECTORY / 'reviewers.json', '/credentials/reviewers.json')],
              env={'WEB_URL': origin, 'GATE_CHECK_HOST': origin.removeprefix('https://')})
    except subprocess.CalledProcessError:
        suspend_edge(v['EDGE_SERVICE_ID'])


def ip_probe():
    """G3: forged client-IP headers must not create new rate-limit buckets on Render's real chain."""
    origin = provider_values()['EDGE_ORIGIN']
    reviewer = load(DIRECTORY / 'reviewers.json')['gate']
    authorization = 'Basic ' + base64.b64encode(f"{reviewer['username']}:{reviewer['password']}".encode()).decode()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    marker = secrets.token_hex(8)

    def call(path, headers=None, body=None):
        request = urllib.request.Request(origin + path, data=body, headers={'Authorization': authorization, **(headers or {})})
        try:
            with opener.open(request, timeout=30) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.read()

    call(f'/robots.txt?probe={marker}', {'X-Forwarded-For': '198.51.100.66', 'True-Client-IP': '198.51.100.67', 'CF-Connecting-IP': '198.51.100.68'})
    token = json.loads(call('/api/v1/auth/csrf')[1])['csrfToken']
    email = f'ip-probe-{marker}@example.invalid'  # never an account: identical failures, no lockout of anyone real
    statuses = []
    for attempt in range(6):
        forged = f'198.51.100.{10 + attempt}'
        status, _ = call('/api/v1/auth/login', {'Content-Type': 'application/json', 'X-CSRF-Token': token, 'Origin': origin,
                                                'X-Forwarded-For': forged, 'True-Client-IP': forged, 'CF-Connecting-IP': forged},
                         json.dumps({'email': email, 'password': 'not-a-real-password-' + marker}).encode())
        statuses.append(status)
    print(json.dumps({'marker': marker, 'loginStatuses': statuses}))
    print(f'Render edge log: the request /robots.txt?probe={marker} must show client_ip = this machine\'s public IP.')
    if statuses != [401] * 5 + [429]:
        raise SystemExit('FAIL: forged client-IP headers changed the rate-limit bucket (or limits differ); do not go live.')
    print('PASS: forged X-Forwarded-For/True-Client-IP/CF-Connecting-IP did not escape the account+IP limit.')


def main(argv=None):
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('action', choices=['init', 'gate', 'assemble', 'window', 'roles', 'migrate', 'fixture', 'probe', 'ip-probe'])
    parser.add_argument('--authorized', action='store_true', help='required for live actions against provisioned resources')
    parser.add_argument('--start', action='store_true')
    parser.add_argument('--extend', type=int)
    parser.add_argument('--reason')
    args = parser.parse_args(argv)
    if args.action in ('roles', 'migrate', 'fixture', 'probe', 'ip-probe'):
        if not args.authorized:
            raise SystemExit('Live action against provisioned resources: refused without --authorized.')
        require_gate()
    if args.action == 'init': init()
    elif args.action == 'gate': gate()
    elif args.action == 'assemble': assemble()
    elif args.action == 'window': window(args.start, args.extend, args.reason)
    elif args.action == 'roles': roles()
    elif args.action == 'migrate': tools(runtime=OPERATOR / 'migration_runtime')
    elif args.action == 'fixture': fixture()
    elif args.action == 'probe': probe()
    else: ip_probe()


if __name__ == '__main__':
    main()
