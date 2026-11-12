#!/usr/bin/env python3
"""CI-only pinned Caddy parser regression. Creates disposable containers, never publish ports.

Not run on a workstation when Docker resource changes are prohibited.
"""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile

spec=importlib.util.spec_from_file_location('coexist_prepare',Path(__file__).with_name('prepare.py'))
edge=importlib.util.module_from_spec(spec)
spec.loader.exec_module(edge)


def handlers(routes):
    for route in routes:
        for handler in route.get('handle',[]):
            yield handler
            yield from handlers(handler.get('routes',[]))


def main():
    with tempfile.TemporaryDirectory() as folder:
        root=Path(folder)
        root.chmod(0o755)
        (root/'Caddyfile').write_text(edge.caddyfile('https://review.example.invalid','https://university.example.invalid','uniweb-12345678','ops@example.invalid'))
        (root/'review-site.caddy').write_bytes((edge.ROOT/'deploy/review-site.caddy').read_bytes())
        gate=root/'gate'
        # Synthetic bcrypt fixture used only for parsing. No password or account exists.
        valid='(reviewer_gate) {\n\tbasic_auth @gated {\n\t\treviewer $2a$14$'+'A'*53+'\n\t}\n}\n'
        command=['docker','run','--rm','--network','none','--read-only','--cap-drop','ALL',
                 '--cap-add','NET_BIND_SERVICE','--security-opt','no-new-privileges:true','--tmpfs','/tmp:size=16m',
                 '--mount',f'type=bind,source={root},target=/etc/caddy,readonly',
                 '--mount',f'type=bind,source={gate},target=/run/secrets/reviewer_gate,readonly',
                 edge.clean.PINS['proxy'],'caddy','adapt','--config','/etc/caddy/Caddyfile','--adapter','caddyfile']
        gate.write_text(valid)
        result=subprocess.run(command,capture_output=True,text=True,check=True)
        config=json.loads(result.stdout)
        routes=[r for server in config['apps']['http']['servers'].values() for r in server['routes']]
        for hostname,upstream in [('review.example.invalid','web:3000'),('university.example.invalid','uniweb-12345678:3000')]:
            matched=[r for r in routes if any(hostname in m.get('host',[]) for m in r.get('match',[]))]
            assert len(matched)==1
            chain=list(handlers(matched))
            proxies=[i for i,h in enumerate(chain) if h['handler']=='reverse_proxy']
            assert any(u['dial']==upstream for h in chain if h['handler']=='reverse_proxy' for u in h['upstreams'])
            auth=[i for i,h in enumerate(chain) if h['handler']=='authentication']
            if hostname.startswith('review'):
                assert auth and max(auth)<min(proxies)
            else:
                assert not auth, 'Staging credentials must not become university credentials'
        assert config['admin']['disabled'] is True
        for content in ('basic_auth { reviewer plaintext }','import missing-snippet.caddy'):
            gate.write_text(content)
            assert subprocess.run(command,capture_output=True).returncode!=0
        gate.unlink()
        # A missing bind source must not be treated as an accepted empty reviewer gate.
        assert subprocess.run(command,capture_output=True).returncode!=0
    print('PASS: pinned Caddy distinct-host routing, authentication order, admin-off and invalid-gate refusal')


if __name__=='__main__':main()
