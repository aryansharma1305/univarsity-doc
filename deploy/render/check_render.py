#!/usr/bin/env python3
"""Phase 14C static assertions for the Render staging configuration; nothing is started or contacted."""
from pathlib import Path
import re
import yaml

root = Path(__file__).resolve().parents[2]
render = root / 'deploy/render'
caddy_image = next(line.split('image:', 1)[1].strip() for line in (root / 'deploy/compose.yml').read_text().splitlines() if 'image: caddy:' in line)

dockerfile = (render / 'Dockerfile.edge').read_text()
assert f'FROM {caddy_image}\n' in dockerfile  # the same pinned Caddy as Phase 14B
assert 'USER 65534:65534' in dockerfile and 'ENTRYPOINT ["/usr/local/bin/edge-start"]' in dockerfile
assert not re.search(r'^(COPY|ADD) .*review_gate', dockerfile, re.M)  # the gate is never baked in

edge = (render / 'Caddyfile.render').read_text()
assert 'admin off' in edge and 'auto_https off' in edge and 'tls internal' not in edge
assert 'trusted_proxies_strict' in edge
assert edge.index('import /etc/secrets/review_gate.caddy') < edge.index('import /etc/caddy/review-site.caddy')
assert 'request>headers delete' in edge  # the access log never records credentials or cookies

site = (root / 'deploy/review-site.caddy').read_text()
assert 'max_size 16MiB' in site
assert site.count('reverse_proxy') == site.count('header_up X-Forwarded-For {client_ip}') == 2

start = (render / 'edge-start.sh').read_text()
for name in ['PORT', 'RENDER_TRUSTED_PROXIES', 'RENDER_CLIENT_IP_HEADER', '/etc/secrets/review_gate.caddy']:
    assert name in start, name
print('PASS: Render edge reuses the pinned Caddy, runs non-root, imports the gate before the site and refuses missing settings')

blueprint = yaml.safe_load((render / 'render.yaml').read_text())
services = {s['name']: s for s in blueprint['services']}
assert blueprint['previews']['generation'] == 'off'
assert [n for n, s in services.items() if s['type'] == 'web'] == ['docversity14c-edge']  # the only public service
assert services['docversity14c-web']['type'] == services['docversity14c-api']['type'] == 'pserv'
assert services['docversity14c-worker']['type'] == 'worker'
for name, service in services.items():
    assert service['region'] == 'singapore', name
    if service['type'] != 'keyvalue':
        assert service['runtime'] == 'image' and re.search(r'@sha256:', service['image']['url']), name
        assert service['autoDeployTrigger'] == 'off', name
        # No secret values in the Blueprint: only fixed, non-secret settings carry a value.
        for variable in service.get('envVars', []):
            assert variable.get('sync') is False or variable['key'] in ('PORT', 'RUNTIME_ENV_FILE'), (name, variable['key'])
assert services['docversity14c-api']['plan'] == '1c-2g'  # Chromium PDF previews (G4)
kv = services['docversity14c-kv']
assert kv['maxmemoryPolicy'] == 'noeviction' and kv['ipAllowList'] == []
[database] = blueprint['databases']
assert database['ipAllowList'] == [] and database['postgresMajorVersion'] == '17' and database['databaseName'] == 'docversity_staging'
print('PASS: Render Blueprint exposes only the edge, pins images by digest, keeps data stores internal and holds no secrets')

for name, service in services.items():
    if service['type'] != 'keyvalue':
        assert service['image']['url'].startswith('ghcr.io/<IMAGE_OWNER>/docversity14c-staging@sha256:') or re.fullmatch(
            r'ghcr\.io/[a-z0-9-]+/docversity14c-staging@sha256:[0-9a-f]{64}', service['image']['url']), name
        assert service['image']['creds']['fromRegistryCreds']['name'] == 'docversity14c-ghcr-read', name
workflow = yaml.safe_load((root / '.github/workflows/staging-images.yml').read_text())
jobs = workflow['jobs']
assert workflow['permissions'] == {'contents': 'read'}
assert 'permissions' not in jobs['build'] and 'push' not in jobs['build']['steps'][-1]['run']
assert jobs['publish']['environment'] == 'staging-images'
assert jobs['publish']['permissions'] == {'contents': 'read', 'packages': 'write'}
assert 'workflow_dispatch' in jobs['publish']['if'] and 'pull_request' not in jobs['publish']['if']
assert 'visibility' not in (render / 'images.sh').read_text().replace('package visibility', '')  # never changed
print('PASS: images come only from the private GHCR package; only the approved dispatch job may push')
