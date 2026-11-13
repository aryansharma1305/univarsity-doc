#!/usr/bin/env python3
"""Offline shared-edge preparation. Never invokes Docker, SSH, DNS or account creation."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shlex

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('university_clean', ROOT / 'deploy/university/clean.py')
clean = importlib.util.module_from_spec(spec)
spec.loader.exec_module(clean)
STAGING_LIMITS = {'api': (640, .10), 'worker': (320, .05), 'web': (384, .05),
                  'postgres': (384, .03), 'redis': (384, .02), 'minio': (384, .02)}
EDGE_CPUS = .75
EDGE_CPU_SHARES = 4096
OPERATOR_CPUS = .10
EDGE_PROJECT = 'docversity-edge'
GATE = re.compile(r'\(reviewer_gate\) \{\n\tbasic_auth @gated \{\n\t\t[a-z]{3,32} \$2[aby]\$1[0-9]\$[./A-Za-z0-9]{53}\n\t\}\n\}\n')


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def private_path(path, outside=True):
    path = Path(path).absolute()
    if path.is_symlink() or any(p.is_symlink() for p in path.parents):
        raise ValueError('Symlink paths are refused')
    if outside and (path == ROOT or ROOT in path.parents):
        raise ValueError('Operator state must be outside the checkout')
    if outside and any((parent/'.git').exists() for parent in (path,*path.parents)):
        raise ValueError('Operator state must be outside every Git checkout')
    return path


def caddyfile(staging_origin, university_origin, web_service, acme_email):
    stage = clean.validate_origin(staging_origin)
    university = clean.validate_origin(university_origin)
    if stage == university:
        raise ValueError('Distinct staging/university hostnames are required')
    if not re.fullmatch(r'uniweb-[a-f0-9]{8}', web_service):
        raise ValueError('Unique university upstream name required')
    if not re.fullmatch(r'[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', acme_email):
        raise ValueError('Approved ACME email required')
    return f'''{{
    email {acme_email}
    admin off
    servers {{
        strict_sni_host on
    }}
}}
import /run/secrets/reviewer_gate
{stage} {{
    import /etc/caddy/review-site.caddy
    header Strict-Transport-Security "max-age=31536000"
}}
{university} {{
    encode zstd gzip
    request_body {{
        max_size 16MiB
    }}
    header {{
        X-Robots-Tag "noindex, nofollow, noarchive"
        Referrer-Policy "same-origin"
        Strict-Transport-Security "max-age=31536000"
        -Server
    }}
    reverse_proxy {web_service}:3000 {{
        header_up X-Forwarded-For {{client_ip}}
    }}
}}
# Container-only liveness; independent of either application's maintenance.
http://:8081 {{
    respond /health 200
    respond 404
}}
'''


def prepare(directory, university_directory, staging_state, staging_origin, acme_email):
    directory = private_path(directory)
    university_directory = private_path(university_directory)
    staging_state = private_path(staging_state, outside=False)
    if directory.exists():
        raise ValueError('Fresh edge directory required; existing state is never overwritten')
    if (staging_state/'shared-edge.json').exists() or (staging_state/'shared-edge.json').is_symlink():
        raise ValueError('Staging already has adoption metadata; review a route update instead')
    instance = json.loads((staging_state / 'instance.json').read_text())
    if instance.get('sharedProxy'):
        raise ValueError('Staging already declares shared-edge adoption')
    stage = instance.get('project', '')
    if not re.fullmatch(r'docversity14[a-z]', stage) or not instance.get('public') or instance.get('origin') != staging_origin:
        raise ValueError('Existing public staging identity/origin must match')
    gate = staging_state / 'review_gate.caddy'
    if gate.is_symlink() or not gate.is_file() or gate.stat().st_mode & 0o222 or not GATE.fullmatch(gate.read_text()):
        raise ValueError('Existing read-only reviewer gate is missing or malformed')
    uni = json.loads((university_directory / 'instance.json').read_text())
    config = json.loads((university_directory / 'compose.json').read_text())
    if not uni.get('sharedProxy') or not re.fullmatch(r'docversity-university-[a-f0-9]{8}', uni.get('project', '')):
        raise ValueError('Prepare university with --shared-proxy first')
    if (config['name'] != uni['project'] or uni['frontendNetwork'] != uni['project']+'_edge'
            or config['networks'] != {'backend': {'internal': True}, 'edge': {'internal': True, 'name': uni['project']+'_edge'}}):
        raise ValueError('University network identity mismatch')
    if set(config['volumes']) != {'postgres','redis','minio'} or any(v.get('external') or 'name' in v for v in config['volumes'].values()):
        raise ValueError('University data volumes must be independently project-scoped')
    if set(config['services'][uni['webService']]['networks']) != {'backend', 'edge'}:
        raise ValueError('University web network mismatch')
    for name, service in config['services'].items():
        if service.get('ports') or service.get('network_mode') or (name != uni['webService'] and service['networks'] != ['backend']):
            raise ValueError('University backend exposure or cross-network membership refused')
    site = caddyfile(staging_origin, uni['intendedUniversityOrigin'], uni['webService'], acme_email)
    directory.mkdir(parents=True, mode=0o700)
    (directory/'config').mkdir(mode=0o700)
    # The private parent protects the host; the bind-mounted child must be readable without DAC caps.
    (directory/'config').chmod(0o755)
    (directory/'config/Caddyfile').write_text(site)
    (directory/'config/review-site.caddy').write_bytes((ROOT/'deploy/review-site.caddy').read_bytes())
    (directory/'config/start.sh').write_bytes((ROOT/'deploy/coexist/start.sh').read_bytes())
    edge = {'name': EDGE_PROJECT, 'services': {'proxy': {
        'image': clean.PINS['proxy'], 'restart': 'unless-stopped',
        'entrypoint': ['/bin/sh','/etc/caddy/start.sh'], 'command': [],
        'ports': ['80:80','443:443'],
        'networks': {n: {'aliases': [EDGE_PROJECT]} for n in ('staging_backend','staging_edge','university_edge')},
        'volumes': [f'{directory}/config:/etc/caddy:ro','caddy:/data','caddy_config:/config'],
        'secrets': ['reviewer_gate'], 'read_only': True, 'tmpfs': ['/tmp:size=16m'],
        'cap_drop': ['ALL'], 'cap_add': ['NET_BIND_SERVICE'], 'security_opt': ['no-new-privileges:true'],
        'mem_limit': '128m', 'memswap_limit': '128m', 'cpus': EDGE_CPUS, 'cpu_shares': EDGE_CPU_SHARES, 'pids_limit': 128,
        'logging': {'driver':'json-file','options':{'max-size':'10m','max-file':'3'}},
        'healthcheck': {'test':['CMD','wget','-q','--spider','http://127.0.0.1:8081/health'], 'interval':'15s','timeout':'5s','retries':3}}},
        'networks': { 'staging_backend': {'external':True,'name':stage+'_backend'},
                      'staging_edge': {'external':True,'name':stage+'_edge'},
                      'university_edge': {'external':True,'name':uni['frontendNetwork']}},
        'volumes': {n:{'external':True,'name':stage+'_'+n} for n in ('caddy','caddy_config')},
        'secrets': {'reviewer_gate':{'file':str(gate)}}}
    overlay = {'services': {'proxy': {'profiles':['retired-shared-edge']},
                            'tools': {'environment':{'GATE_CHECK_HOST':EDGE_PROJECT}}}}
    for name, (memory, cpu) in STAGING_LIMITS.items():
        overlay['services'][name] = {'mem_limit':f'{memory}m','memswap_limit':f'{memory}m',
                                     'cpus':cpu,'cpu_shares':128,'pids_limit':256}
    for name in ('tools','migrate','backup-readiness'):
        overlay['services'].setdefault(name,{}).update(mem_limit='512m',memswap_limit='512m',cpus=OPERATOR_CPUS,pids_limit=256)
    for name, value in [('compose.json',edge),('staging-overlay.json',overlay)]:
        (directory/name).write_text(json.dumps(value,indent=2)+'\n')
    files = ('compose.json','staging-overlay.json','config/Caddyfile','config/review-site.caddy','config/start.sh')
    record = {'format':1,'stagingProject':stage,'stagingOrigin':staging_origin,
              'universityProject':uni['project'],'universityOrigin':uni['intendedUniversityOrigin'],
              'edgeProject':EDGE_PROJECT,'directory':str(directory),'gateDigest':digest(gate),
              'files':{name:digest(directory/name) for name in files},
              'liveChangesAuthorized':False,'imageSourceCommit':uni['imageSourceCommit']}
    (directory/'shared-edge.json').write_text(json.dumps(record,indent=2)+'\n')
    for path in directory.rglob('*'):
        if path.is_file(): path.chmod(0o444)
    return record


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ('directory','university-directory','staging-state','staging-origin','acme-email'):
        parser.add_argument('--'+name,required=True)
    args=parser.parse_args()
    try:
        record=prepare(args.directory,args.university_directory,args.staging_state,args.staging_origin,args.acme_email)
        command=['docker','compose','--project-name',EDGE_PROJECT,'-f',str(Path(args.directory).absolute()/'compose.json')]
        print('Prepared offline only; no Docker resources, routing or credentials changed.')
        print(shlex.join(command+['config','--quiet']))
        print('Read docs/development/shared-proxy-coexistence.md before any live operation.')
    except (ValueError,OSError,KeyError,json.JSONDecodeError):
        raise SystemExit('Preparation refused: verify private paths, instance identities, gate and isolation. No live operation performed.') from None


if __name__=='__main__':
    os.umask(0o077)
    main()
