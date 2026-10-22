#!/usr/bin/env python3
"""Regression assertions for the local staging trust boundary; no services are started."""
from pathlib import Path
import json
import subprocess

root = Path(__file__).resolve().parents[2]
config = json.loads(subprocess.check_output(['docker','compose','-f',str(root/'deploy/compose.yml'),'config','--format','json'], text=True))
services = config['services']
assert config['name'] == 'docversity14a'
assert config['networks']['backend']['internal'] is True
for name in ['postgres','redis','minio','api','worker','web']:
    service = services[name]
    assert not service.get('ports'), name
    assert service.get('mem_limit'), name
    assert service.get('healthcheck'), name
for name in ['api','worker','web']:
    assert services[name]['read_only'] is True
    assert 'ALL' in services[name]['cap_drop']
    assert services[name]['security_opt'] == ['no-new-privileges:true']
    assert not services[name].get('privileged')
    assert services[name]['secrets']
assert services['proxy']['ports'][0]['host_ip'] == '127.0.0.1'
assert services['proxy']['ports'][0]['published'] == '3443'
assert any(volume.get('source') == str(root / 'deploy/Caddyfile') for volume in services['proxy']['volumes'])
local_proxy = (root / 'deploy/Caddyfile').read_text()
assert 'https://localhost' in local_proxy and 'tls internal' in local_proxy
assert 'skip_install_trust' in local_proxy
assert services['api']['depends_on']['migrate']['condition'] == 'service_completed_successfully'
for secret in config['secrets'].values():
    assert Path(secret['file']).is_relative_to(root/'.local/staging')
for file in ['deploy/Dockerfile','deploy/compose.yml']:
    assert '.env' not in (root/file).read_text()
print('PASS: private networking, loopback HTTPS, health/dependency/resource controls and runtime-only secrets')

# Phase 14B reviewer and public overlays: the gate fronts everything, and only Caddy is published.
def merged(*overlays):
    files = [arg for name in ['compose.yml', *overlays] for arg in ('-f', str(root / 'deploy' / name))]
    env = dict(__import__('os').environ, STAGING_PROJECT='docversity14b', PUBLIC_DOMAIN='staging.example.invalid', ACME_EMAIL='operator@example.invalid')
    return json.loads(subprocess.check_output(['docker', 'compose', *files, 'config', '--format', 'json'], text=True, env=env))
review = merged('compose.review.yml')
public = merged('compose.review.yml', 'compose.public.yml')
assert review['name'] == public['name'] == 'docversity14b'
mounts = lambda c: {v['target']: v['source'] for v in c['services']['proxy']['volumes']}
assert mounts(review)['/etc/caddy/Caddyfile'] == str(root / 'deploy/Caddyfile.review')
assert mounts(public)['/etc/caddy/Caddyfile'] == str(root / 'deploy/Caddyfile.review-public')
for c in [review, public]:
    assert mounts(c)['/etc/caddy/review-gate.caddy'] == str(root / '.local/staging/review_gate.caddy')
    # Fail closed: Compose must refuse a missing gate rather than create an empty directory for it.
    for volume in c['services']['proxy']['volumes']:
        if volume['target'].startswith('/etc/caddy/'):
            assert volume['type'] == 'bind' and volume.get('read_only') is True, volume['target']
            assert volume.get('bind', {}).get('create_host_path') is False, volume['target']
    assert c['networks']['backend']['internal'] is True
    assert [n for n, s in c['services'].items() if s.get('ports') and n != 'proxy'] == []
assert [(p.get('host_ip'), p['published'], p['target']) for p in review['services']['proxy']['ports']] == [('127.0.0.1', '3443', 443)]
assert sorted((p['published'], p['target']) for p in public['services']['proxy']['ports']) == [('443', 443), ('80', 80)]
site = (root / 'deploy/review-site.caddy').read_text()
assert '@gated not path /robots.txt' in site and 'import reviewer_gate' in site
assert 'review-gate.caddy' not in site  # the snippet comes only from the private gate file
assert 'noindex' in site
for name in ['Caddyfile.review', 'Caddyfile.review-public']:
    text = (root / 'deploy' / name).read_text()
    assert 'import /etc/caddy/review-site.caddy' in text and 'admin off' in text
    # The gate file is imported at top level (defining the snippet) before any site uses it.
    assert text.index('import /etc/caddy/review-gate.caddy') < text.index('import /etc/caddy/review-site.caddy')
assert 'tls internal' not in (root / 'deploy/Caddyfile.review-public').read_text()
print('PASS: Phase 14B reviewer gate on every overlay; public overlay publishes only Caddy 80/443')
