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
