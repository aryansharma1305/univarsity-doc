#!/usr/bin/env python3
"""Phase 14C Render edge regression: the ACTUAL edge image fails closed and forwards safely.

Builds deploy/render/Dockerfile.edge and runs it on a throwaway Docker network, with an
echo server standing in for the private Next.js and API services, published on a loopback-only port:

- every Phase 14B gate variant: the valid gate answers 401 to anonymous requests from its very first
  response and admits the reviewer; missing, empty, unwrapped, misnamed and plaintext gates stop the
  container before it ever listens; the empty snippet is refused by staging.py's validator;
- missing or malformed edge settings (PORT, RENDER_TRUSTED_PROXIES, RENDER_CLIENT_IP_HEADER) stop
  the container before it listens;
- every gated route class refuses anonymous, wrong-password and wrong-user requests; robots.txt is
  public; /health reaches the API upstream; the Caddy admin API is off; the edge runs as non-root;
- client IP: the application always receives exactly ONE X-Forwarded-For entry. From a trusted front
  proxy the right-most untrusted address wins, so a client-prepended value never does; from an
  untrusted peer every client-supplied header is ignored;
- request bodies of the largest upload (15 MiB) plus multipart overhead pass intact up to exactly
  16 MiB; one byte more is refused with 413 at the edge.

Uses only throwaway containers and one throwaway bridge network, all removed afterwards. Needs Docker.
"""
from pathlib import Path
import base64
import http.client
import json
import os
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'deploy' / 'scripts'))
import gate_regression  # noqa: E402  (shares the 14B gate variants and the pinned Caddy image)
import staging  # noqa: E402  (layer 1 validator)

IMAGE = 'docversity14c-edge:regression'
# Any local image with Node.js serves the echo upstream; the Phase 14B web image is already present.
ECHO_IMAGE = os.environ.get('RENDER_ECHO_IMAGE', 'docversity14b-web:local')
NETWORK = 'docversity14c-edge-regression'
EDGE = 'docversity14c-edge-regression'
ECHO = 'docversity14c-echo-regression'
PORT = 3497
MIB = 1024 * 1024
PASSWORD = 'synthetic-regression-password'
SETTINGS = {'PORT': '10000', 'RENDER_TRUSTED_PROXIES': 'private_ranges', 'RENDER_CLIENT_IP_HEADER': 'X-Forwarded-For',
            'WEB_UPSTREAM': f'{ECHO}:8080', 'API_UPSTREAM': f'{ECHO}:8080'}
ECHO_SERVER = """
require('http').createServer((q, s) => {
  let bytes = 0;
  q.on('data', (c) => (bytes += c.length));
  q.on('end', () => {
    s.setHeader('content-type', 'application/json');
    s.end(JSON.stringify({ path: q.url, xff: q.headers['x-forwarded-for'] ?? null, bytes }));
  });
}).listen(8080);
"""


def run(*args, **kwargs):
    return subprocess.run(args, capture_output=True, text=True, **kwargs)


def basic(user, password):
    return 'Basic ' + base64.b64encode(f'{user}:{password}'.encode()).decode()


REVIEWER = basic('reviewer', PASSWORD)


def request(path='/', method='GET', headers=None, body=None, timeout=10):
    """(status, parsed JSON or None), or (None, None) when nothing answers."""
    try:
        connection = http.client.HTTPConnection('127.0.0.1', PORT, timeout=timeout)
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        data = response.read()
        try:
            return response.status, json.loads(data)
        except ValueError:
            return response.status, None
    except OSError:
        return None, None


def start_edge(gate_file, settings=SETTINGS):
    run('docker', 'rm', '-f', '-v', EDGE)
    mounts = ['-v', f'{gate_file}:/etc/secrets/review_gate.caddy:ro'] if gate_file else []
    env = [arg for key, value in settings.items() for arg in ('-e', f'{key}={value}')]
    # Published on loopback only; requests arrive from the bridge gateway, a private address.
    run('docker', 'run', '-d', '--name', EDGE, '--network', NETWORK, '-p', f'127.0.0.1:{PORT}:10000',
        '--read-only', '--tmpfs', '/tmp', '--cap-drop', 'ALL', *env, *mounts, IMAGE, check=True)


def watch(seconds):
    observed, deadline = [], time.monotonic() + seconds
    while time.monotonic() < deadline:
        observed.append(request('/', timeout=2)[0])
        time.sleep(0.05)
    return observed


def running():
    return run('docker', 'inspect', '-f', '{{.State.Running}}', EDGE).stdout.strip() == 'true'


def wait_ready():
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        if request('/robots.txt', timeout=2)[0] == 200:
            return True
        time.sleep(0.1)
    return False


def check(results, failures, name, ok, **details):
    results.append({'check': name, **details, 'result': 'PASS' if ok else 'FAIL'})
    if not ok:
        failures.append(name)


def gate_and_settings(directory, results, failures):
    for name, path in gate_regression.gate_variants(directory).items():
        if path is None:
            validator = 'missing'
        else:
            original, staging.GATE = staging.GATE, path
            validator = staging.gate_problem() or 'accepted'
            staging.GATE = original
        start_edge(path)
        observed = watch(5)
        answered = sorted({s for s in observed if s is not None})
        alive = running()
        if name == 'valid':
            check(results, failures, f'gate: {name}', validator == 'accepted' and alive and answered == [401],
                  validator=validator, anonymous_statuses=answered)
        elif name == 'empty snippet':
            # Caddy cannot see a gate without rules; staging.py's validator (and the live probe) must.
            check(results, failures, f'gate: {name}', validator != 'accepted', validator=validator,
                  note='refused before upload by the layer-1 validator and after deploy by the gate probe')
        else:
            check(results, failures, f'gate: {name}', validator != 'accepted' and not alive and answered == [],
                  validator=validator, edge_running=alive, anonymous_statuses=answered)
    valid = gate_regression.gate_variants(directory)['valid']
    broken = {
        'PORT missing': {k: v for k, v in SETTINGS.items() if k != 'PORT'},
        'PORT not a number': {**SETTINGS, 'PORT': '10000;'},
        'trusted proxies missing': {k: v for k, v in SETTINGS.items() if k != 'RENDER_TRUSTED_PROXIES'},
        'trusted proxies malformed': {**SETTINGS, 'RENDER_TRUSTED_PROXIES': '0.0.0.0/0 }'},
        'client IP header missing': {k: v for k, v in SETTINGS.items() if k != 'RENDER_CLIENT_IP_HEADER'},
        'client IP header not allow-listed': {**SETTINGS, 'RENDER_CLIENT_IP_HEADER': 'X-Client-IP'},
    }
    for name, settings in broken.items():
        start_edge(valid, settings)
        answered = sorted({s for s in watch(2) if s is not None})
        logs = run('docker', 'logs', EDGE).stderr.strip().splitlines()
        check(results, failures, f'settings: {name}', not running() and answered == [],
              edge_running=running(), anonymous_statuses=answered, log=(logs or [''])[-1][:120])
    return valid


def routes_ip_and_body(valid, results, failures):
    start_edge(valid)
    if not wait_ready():
        check(results, failures, 'edge ready', False)
        return
    refused = []
    for method, path in [('GET', '/'), ('GET', '/health'), ('GET', '/admin/login'), ('GET', '/student/login'),
                         ('GET', '/api/v1/auth/csrf'), ('POST', '/api/v1/auth/login'), ('GET', '/_next/static/x.js')]:
        for label, auth in [('anonymous', None), ('wrong password', basic('reviewer', 'wrong')), ('wrong user', basic('intruder', PASSWORD))]:
            status = request(path, method, {'Authorization': auth} if auth else {})[0]
            if status != 401:
                refused.append(f'{label} {method} {path} -> {status}')
    check(results, failures, 'gate on every route class', not refused, refused_21=21 - len(refused), problems=refused)
    check(results, failures, 'robots.txt public', request('/robots.txt')[0] == 200)
    status, body = request('/health', headers={'Authorization': REVIEWER})
    check(results, failures, 'reviewer admitted; /health reaches the API upstream', status == 200 and body['path'] == '/health')
    reload = run('docker', 'exec', EDGE, 'caddy-unprivileged', 'reload', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile')
    user = run('docker', 'inspect', '-f', '{{.Config.User}}', EDGE).stdout.strip()
    check(results, failures, 'admin API off; non-root', reload.returncode != 0 and user == '65534:65534', user=user)

    # Trusted front proxy (the published port arrives from the private bridge gateway).
    gateway = request('/', headers={'Authorization': REVIEWER})[1]['xff']
    cases = {
        'no header': ({}, gateway),
        'front proxy sets client': ({'X-Forwarded-For': '203.0.113.7'}, '203.0.113.7'),
        'client prepends a spoof': ({'X-Forwarded-For': '198.51.100.66, 203.0.113.7'}, '203.0.113.7'),
        'client spoofs another header': ({'True-Client-IP': '198.51.100.66'}, gateway),
    }
    seen = {}
    for name, (headers, expected) in cases.items():
        xff = request('/', headers={'Authorization': REVIEWER, **headers})[1]['xff']
        seen[name] = xff
        check(results, failures, f'client IP (trusted front): {name}', xff == expected and ',' not in xff, forwarded=xff, expected=expected)

    # Untrusted peer: no client-supplied header is believed.
    start_edge(valid, {**SETTINGS, 'RENDER_TRUSTED_PROXIES': '10.255.255.0/24'})
    wait_ready()
    xff = request('/', headers={'Authorization': REVIEWER, 'X-Forwarded-For': '203.0.113.7'})[1]['xff']
    check(results, failures, 'client IP (untrusted peer): spoof ignored', xff == gateway, forwarded=xff, expected=gateway)

    start_edge(valid)
    wait_ready()
    for name, size, expected in [('largest upload + overhead (15.5 MiB)', 15 * MIB + MIB // 2, 200),
                                 ('exactly 16 MiB', 16 * MIB, 200), ('16 MiB + 1 byte', 16 * MIB + 1, 413)]:
        status, body = request('/api/v1/historical-documents', 'POST',
                               {'Authorization': REVIEWER, 'Content-Type': 'application/octet-stream'}, b'\0' * size, timeout=60)
        intact = expected != 200 or (body or {}).get('bytes') == size
        check(results, failures, f'body: {name}', status == expected and intact, status=status, forwarded_bytes=(body or {}).get('bytes'))


def main():
    gate_regression.HASH = run('docker', 'run', '--rm', '-i', '--network', 'none', gate_regression.CADDY, 'caddy', 'hash-password',
                               input=PASSWORD + '\n', check=True).stdout.strip().splitlines()[-1]
    run('docker', 'build', '-q', '-t', IMAGE, '-f', str(ROOT / 'deploy/render/Dockerfile.edge'), str(ROOT / 'deploy'), check=True)
    results, failures = [], []
    try:
        run('docker', 'network', 'create', NETWORK, check=True)
        run('docker', 'run', '-d', '--name', ECHO, '--network', NETWORK, '--read-only', '--cap-drop', 'ALL', '--user', '1000:1000',
            '--entrypoint', 'node', ECHO_IMAGE, '-e', ECHO_SERVER, check=True)
        with tempfile.TemporaryDirectory() as directory:
            valid = gate_and_settings(directory, results, failures)
            routes_ip_and_body(valid, results, failures)
    finally:
        run('docker', 'rm', '-f', '-v', EDGE, ECHO)
        run('docker', 'network', 'rm', NETWORK)
        run('docker', 'image', 'rm', IMAGE)
    print(json.dumps(results, indent=2))
    if failures:
        raise SystemExit(f'FAIL: Render edge regression: {failures}')
    print(f'PASS: Render edge fails closed and forwards safely ({len(results)} checks)')


if __name__ == '__main__':
    main()
