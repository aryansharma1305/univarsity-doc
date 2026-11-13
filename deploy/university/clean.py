#!/usr/bin/env python3
"""Prepare an isolated university instance offline. Never starts, migrates or contacts a VPS."""
import argparse
import json
import os
from pathlib import Path
import re
import secrets
import shlex
import subprocess
import uuid
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
PINS = {
    'postgres': 'postgres:17.11-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24',
    'redis': 'redis:7.4-alpine@sha256:858f009f9709ce576febc734aa78b8f6d624b82571f9ddb6bda4377c833b3499',
    'minio': 'cgr.dev/chainguard/minio@sha256:e7ca559d9f7c0b5f24f5f669bb92f40f3ca88d56273b808bf3a7c116c17d2ffa',
    'proxy': 'caddy:2-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f',
}
ROLES = ('api', 'worker', 'web', 'tools')
# MiB / CPU burst ceilings to rehearse; CPU caps are not reservations or aggregate host capacity.
UNIVERSITY_LIMITS = {'api': (1024, .75), 'worker': (512, .25), 'web': (512, .50),
                     'postgres': (512, .25), 'redis': (192, .10), 'minio': (320, .25)}


def image_ids(manifest):
    if not re.fullmatch(r'[a-f0-9]{40}', manifest.get('commit', '')):
        raise ValueError('Reviewed source SHA required')
    if manifest.get('architecture') != 'linux/amd64':
        raise ValueError('Hostinger image set must be linux/amd64')
    images = manifest.get('images', {})
    if set(images) != set(ROLES):
        raise ValueError('Complete API/worker/web/tools image set required')
    result = {role: images[role].get('id', '') for role in ROLES}
    if not all(re.fullmatch(r'sha256:[a-f0-9]{64}', value) for value in result.values()):
        raise ValueError('Immutable image config IDs required; tags are refused')
    return result


def validate_origin(origin):
    parsed = urlparse(origin)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.port or parsed.path or parsed.query or parsed.fragment:
        raise ValueError('Use an exact approved https://hostname origin, without port/path')
    if origin != f'https://{parsed.hostname}' or not re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?', parsed.hostname):
        raise ValueError('Invalid origin hostname')
    return parsed.hostname


def runtime_files(origin, private_origin=None):
    validate_origin(origin)
    values = {key: secrets.token_hex(32) for key in ('bootstrap', 'owner', 'app', 'redis', 'session', 'minio', 's3')}
    web_origin = private_origin or origin
    api = f'''NODE_ENV=production
LOG_LEVEL=log
API_HOST=0.0.0.0
API_PORT=4000
WEB_URL={web_origin}
CORS_ORIGINS={web_origin}
SWAGGER_ENABLED=false
TRUST_PROXY=2
COOKIE_SECURE=true
SESSION_SECRET={values['session']}
DATABASE_URL=postgresql://docversity_app:{values['app']}@postgres:5432/docversity_university
REDIS_URL=redis://docversity:{values['redis']}@redis:6379
REDIS_KEY_PREFIX=university:
QUEUE_PREFIX=university
S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_BUCKET=docversity-university
S3_ACCESS_KEY=university_app
S3_SECRET_KEY={values['s3']}
S3_FORCE_PATH_STYLE=true
WORKER_CONCURRENCY=1
IMPORT_CONCURRENCY=1
'''
    worker_keys = {'NODE_ENV', 'LOG_LEVEL', 'DATABASE_URL', 'REDIS_URL', 'QUEUE_PREFIX', 'S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_FORCE_PATH_STYLE', 'WORKER_CONCURRENCY', 'IMPORT_CONCURRENCY'}
    return {
        'database_bootstrap_password': values['bootstrap'], 'database_owner_password': values['owner'],
        'database_app_password': values['app'], 'redis_password': values['redis'],
        'redis_config': f"bind 0.0.0.0\nprotected-mode yes\nuser default off\nuser docversity on >{values['redis']} ~university:* &university:* +@all -@admin -flushall -flushdb\nappendonly yes\nmaxmemory 192mb\nmaxmemory-policy noeviction\n",
        'runtime': api,
        'worker_runtime': '\n'.join(line for line in api.splitlines() if line.split('=', 1)[0] in worker_keys),
        'web_runtime': 'NODE_ENV=production\nAPI_INTERNAL_URL=http://api:4000\nWEB_BEHIND_TRUSTED_PROXY=true\n',
        'migration_runtime': f"DATABASE_URL=postgresql://docversity_owner:{values['owner']}@postgres:5432/docversity_university\n",
        'minio': f"MINIO_ROOT_USER=university_owner\nMINIO_ROOT_PASSWORD={values['minio']}\nS3_BUCKET=docversity-university\nS3_ACCESS_KEY=university_app\nS3_SECRET_KEY={values['s3']}\n",
    }


def compose_config(directory, images, instance, https_port):
    label = {'docversity.clean-instance': instance}
    logging = {'driver': 'json-file', 'options': {'max-size': '10m', 'max-file': '3'}}
    def app(role, secret='runtime'):
        return {'image': images[role], 'pull_policy': 'never', 'restart': 'unless-stopped', 'init': True, 'read_only': True,
                'tmpfs': ['/tmp:size=256m,mode=1777'], 'cap_drop': ['ALL'], 'security_opt': ['no-new-privileges:true'],
                'pids_limit': 256, 'mem_limit': '1g', 'cpus': 1, 'stop_grace_period': '60s',
                'networks': ['backend'], 'secrets': [{'source': secret, 'target': 'runtime'}], 'labels': label, 'logging': logging}
    def health(test, interval='5s'):
        return {'test': test, 'interval': interval, 'timeout': '5s', 'retries': 30}
    scripts = str(ROOT / 'deploy/scripts')
    services = {}
    services['postgres'] = {'image': PINS['postgres'], 'environment': {'POSTGRES_USER': 'docversity_bootstrap', 'POSTGRES_DB': 'docversity_university', 'POSTGRES_PASSWORD_FILE': '/run/secrets/database_bootstrap_password'}, 'secrets': ['database_bootstrap_password','database_owner_password','database_app_password'], 'volumes': ['postgres:/var/lib/postgresql/data', f'{ROOT}/deploy/postgres/init.sh:/docker-entrypoint-initdb.d/10-app.sh:ro'], 'healthcheck': health(['CMD-SHELL','pg_isready -h 127.0.0.1 -U docversity_bootstrap -d docversity_university']), 'mem_limit':'512m'}
    services['redis'] = {'image':PINS['redis'], 'user':'redis', 'command':['redis-server','/run/secrets/redis_config'], 'secrets':['redis_config','redis_password'], 'read_only':True, 'tmpfs':['/tmp:size=16m'], 'volumes':['redis:/data'], 'cap_drop':['ALL'], 'mem_limit':'256m', 'healthcheck':health(['CMD-SHELL','REDISCLI_AUTH=$$(cat /run/secrets/redis_password) redis-cli --user docversity --no-auth-warning ping | grep -q PONG'])}
    services['minio'] = {'image':PINS['minio'], 'entrypoint':['/bin/sh','/deploy/minio.sh'], 'secrets':['minio'], 'volumes':['minio:/data',f'{ROOT}/docker/minio:/docker/minio:ro',f'{scripts}:/deploy:ro'], 'read_only':True,'tmpfs':['/tmp:size=64m,mode=1777'],'cap_drop':['ALL'],'mem_limit':'512m','healthcheck':health(['CMD-SHELL','. /deploy/read-minio.sh; export MC_CONFIG_DIR=/tmp/.mc; export MC_HOST_local="http://$${MINIO_ROOT_USER}:$${MINIO_ROOT_PASSWORD}@127.0.0.1:9000"; mc ready local >/dev/null 2>&1 && test -f /tmp/.docversity-initialised'])}
    services['migrate'] = {**app('tools','migration_runtime'),'profiles':['operator'],'restart':'no','depends_on':{'postgres':{'condition':'service_healthy'}},'command':['node','packages/database/node_modules/prisma/build/index.js','migrate','deploy','--config','packages/database/prisma.config.ts']}
    services['api'] = {**app('api'),'depends_on':{'postgres':{'condition':'service_healthy'},'redis':{'condition':'service_healthy'},'minio':{'condition':'service_healthy'}},'healthcheck':health(['CMD','node','-e',"fetch('http://127.0.0.1:4000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"],'15s')}
    services['worker'] = {**app('worker','worker_runtime'),'stop_grace_period':'5m','depends_on':{'api':{'condition':'service_healthy'}},'healthcheck':{'test':['CMD','node','/launch.mjs','node','dist/scripts/enqueue-health-test.js'],'interval':'60s','timeout':'20s','retries':3,'start_period':'30s'}}
    services['web'] = {**app('web','web_runtime'),'environment':{'RUNTIME_ENV_FILE':'/run/secrets/runtime'},'networks':['backend','edge'],'tmpfs':['/tmp:size=64m,mode=1777','/app/apps/web/.next/cache:size=32m,uid=1000,gid=1000'],'depends_on':{'api':{'condition':'service_healthy'}},'healthcheck':health(['CMD','node','-e',"fetch('http://127.0.0.1:3000/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"],'15s')}
    services['check-empty'] = {**app('tools','migration_runtime'),'profiles':['operator'],'restart':'no','volumes':[f'{ROOT}/deploy/university:/operations:ro'],'command':['node','/operations/check-empty.mjs']}
    services['backup-readiness'] = {**app('worker','worker_runtime'),'profiles':['operator'],'restart':'no','healthcheck':{'disable':True},'command':['node','dist/scripts/backup-readiness.js']}
    services['storage-tools'] = {'image':PINS['minio'],'profiles':['operator'],'restart':'no','entrypoint':['/bin/sh','/operations/storage.sh'],'secrets':['minio'],'volumes':[f'{scripts}:/operations:ro',f'{directory}/backups:/backups'],'read_only':True,'tmpfs':['/tmp:size=16m,mode=1777'],'cap_drop':['ALL'],'mem_limit':'128m','user':f'{os.getuid()}:{os.getgid()}'}
    services['proxy'] = {'image':PINS['proxy'],'ports':[f'127.0.0.1:{https_port}:443'],'volumes':[f'{directory}/Caddyfile:/etc/caddy/Caddyfile:ro','caddy:/data','caddy_config:/config'],'networks':['edge','backend'],'cap_drop':['ALL'],'cap_add':['NET_BIND_SERVICE'],'mem_limit':'128m','depends_on':{'web':{'condition':'service_healthy'}},'healthcheck':health(['CMD','wget','-q','--spider','--no-check-certificate','https://localhost/'],'15s')}
    for name, service in services.items():
        service.setdefault('labels',label);service.setdefault('logging',logging);service.setdefault('networks',['backend']);service.setdefault('security_opt',['no-new-privileges:true']);service.setdefault('restart','unless-stopped');service.setdefault('stop_grace_period','60s')
    return {'name': 'docversity-university-'+instance[:8], 'services':services,
            'networks':{'backend':{'internal':True},'edge':{}},
            'volumes':{name:{'labels':label} for name in ('postgres','redis','minio','caddy','caddy_config')},
            'secrets':{name:{'file':str(directory/'secrets'/name)} for name in runtime_files_keys()}}


def runtime_files_keys():
    return ('database_bootstrap_password','database_owner_password','database_app_password','redis_password','redis_config','runtime','worker_runtime','web_runtime','migration_runtime','minio')


def caddyfile():
    return '''{\n  admin off\n}\nhttps://localhost:443 {\n  tls internal\n  encode zstd gzip\n  request_body {\n    max_size 16MiB\n  }\n  header {\n    X-Robots-Tag "noindex, nofollow, noarchive"\n    Referrer-Policy "same-origin"\n    -Server\n  }\n  handle {\n    reverse_proxy web:3000 {\n      header_up X-Forwarded-For {client_ip}\n    }\n  }\n}\n'''


def prepare(directory, origin, manifest, port=3553, shared_proxy=False):
    directory = Path(directory).absolute()
    if directory.exists() or directory.is_symlink() or any(parent.is_symlink() for parent in directory.parents):
        raise ValueError('Choose a fresh private directory without symlink parents; existing instances are never overwritten')
    if directory == ROOT or ROOT in directory.parents:
        raise ValueError('Credentials must be outside the checkout')
    if any((parent/'.git').exists() for parent in (directory,*directory.parents)):
        raise ValueError('Credentials must be outside every Git checkout')
    if not 1024 < port < 65536:
        raise ValueError('Use an unused unprivileged local HTTPS port')
    directory=directory.resolve()
    if directory == ROOT or ROOT in directory.parents:
        raise ValueError('Credentials must be outside the checkout')
    images=image_ids(manifest); files=runtime_files(origin, None if shared_proxy else f'https://localhost:{port}'); instance=uuid.uuid4().hex
    if shared_proxy:
        files['redis_config'] = files['redis_config'].replace('maxmemory 192mb', 'maxmemory 96mb')
    directory.mkdir(mode=0o700,parents=True);(directory/'secrets').mkdir(mode=0o700);(directory/'backups').mkdir(mode=0o700)
    for name, content in files.items():
        target=directory/'secrets'/name;target.write_text(content.rstrip()+'\n');target.chmod(0o444)
    config=compose_config(directory,images,instance,port)
    if shared_proxy:
        del config['services']['proxy']
        config['services']['staff-bootstrap'] = {
            **{key:value for key,value in config['services']['api'].items() if key not in ('depends_on','healthcheck')},
            'profiles':['operator'], 'restart':'no', 'healthcheck':{'disable':True},
            'command':['node','dist/cli/create-admin.js'],
        }
        for name in ('caddy', 'caddy_config'):
            del config['volumes'][name]
        for name, service in config['services'].items():
            memory, cpu = UNIVERSITY_LIMITS.get(name, (512, .10))
            service.update(mem_limit=f'{memory}m', memswap_limit=f'{memory}m', cpus=cpu,
                           pids_limit=256, cpu_shares=512)
        # Compose always registers the service name as DNS; an alias alone cannot remove "web".
        web_service = 'uniweb-' + instance[:8]
        config['services'][web_service] = config['services'].pop('web')
        config['networks']['edge'] = {'internal': True, 'name': config['name'] + '_edge'}
    (directory/'compose.json').write_text(json.dumps(config,indent=2)+'\n');(directory/'compose.json').chmod(0o600)
    (directory/'Caddyfile').write_text(caddyfile());(directory/'Caddyfile').chmod(0o444)
    record={'format':1,'instance':instance,'project':config['name'],'intendedUniversityOrigin':origin,'privateLocalOrigin':f'https://localhost:{port}','imageSourceCommit':manifest['commit'],'images':images,'realDataAuthorized':False,'publicCutoverAuthorized':False,'sourceRoot':str(ROOT)}
    if shared_proxy:
        record.update(sharedProxy=True, privateLocalOrigin=None, webService=web_service, frontendNetwork=config['name']+'_edge')
    (directory/'instance.json').write_text(json.dumps(record,indent=2)+'\n');(directory/'instance.json').chmod(0o600)
    return record


def plan(directory):
    directory=Path(directory).absolute();record=json.loads((directory/'instance.json').read_text())
    if not re.fullmatch(r'docversity-university-[a-f0-9]{8}',record.get('project','')):
        raise ValueError('Not a clean university instance')
    config=json.loads((directory/'compose.json').read_text())
    if config['name']!=record['project']:
        raise ValueError('Project identity mismatch')
    command=['docker','compose','--project-name',record['project'],'-f',str(directory/'compose.json')]
    if record.get('sharedProxy'):
        return [command+['config','--quiet'], command+['up','--no-build','-d','--wait','postgres','redis','minio'],
                command+['--profile','operator','run','--rm','--no-deps','migrate'],
                command+['--profile','operator','run','--rm','--no-deps','check-empty'],
                command+['up','--no-build','-d','--wait','api','worker',record['webService']]]
    commands=[command+['config','--quiet'], command+['up','-d','--wait','postgres','redis','minio'],command+['--profile','operator','run','--rm','migrate'],command+['--profile','operator','run','--rm','check-empty'],command+['run','--rm','--no-deps','api','node','dist/cli/create-admin.js'],command+['--profile','operator','run','--rm','check-empty','node','/operations/check-empty.mjs','--after-bootstrap'],command+['up','--no-build','-d','--wait','api','worker','web','proxy']]
    return commands


def prepare_public(directory, acme_email):
    """Write review-only candidate files; no DNS/ACME requests, proxy stop or deployment."""
    directory=Path(directory).absolute()
    plan(directory)  # Validate clean project identity before producing a cutover candidate.
    record=json.loads((directory/'instance.json').read_text())
    if record.get('sharedProxy'):
        raise ValueError('Shared-proxy instances must use deploy/coexist/prepare.py; a second public proxy is refused')
    domain=validate_origin(record['intendedUniversityOrigin'])
    if not re.fullmatch(r'[A-Za-z0-9.!#$%&*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',acme_email):
        raise ValueError('An approved ACME contact email is required')
    target=directory/'public-candidate'
    if target.exists() or target.is_symlink():raise ValueError('Public candidate exists; refusing to overwrite')
    target.mkdir(mode=0o700)
    runtime=(directory/'secrets/runtime').read_text()
    runtime='\n'.join(('WEB_URL='+record['intendedUniversityOrigin']) if line.startswith('WEB_URL=') else ('CORS_ORIGINS='+record['intendedUniversityOrigin']) if line.startswith('CORS_ORIGINS=') else line for line in runtime.splitlines())+'\n'
    (target/'runtime').write_text(runtime);(target/'runtime').chmod(0o444)
    site=caddyfile().replace('  admin off','  email '+acme_email+'\n  admin off').replace('https://localhost:443','https://'+domain).replace('  tls internal\n','')
    (target/'Caddyfile').write_text(site);(target/'Caddyfile').chmod(0o444)
    config=json.loads((directory/'compose.json').read_text())
    config['services']['proxy']['ports']=['80:80','443:443']
    config['services']['proxy']['environment']={}
    config['services']['proxy']['volumes'][0]=str(target/'Caddyfile')+':/etc/caddy/Caddyfile:ro'
    config['secrets']['runtime']['file']=str(target/'runtime')
    # TLS health must use the approved hostname/SNI, not localhost (no internal certificate here).
    config['services']['proxy']['healthcheck']['test']=['CMD','wget','-q','--spider','--no-check-certificate','https://'+domain+'/']
    (target/'compose.json').write_text(json.dumps(config,indent=2)+'\n');(target/'compose.json').chmod(0o600)
    return target


def validate_release(directory, approved_sha):
    """Read-only source check: prepared commands cannot certify an old/mutable application image."""
    directory=Path(directory).absolute();record=json.loads((directory/'instance.json').read_text())
    if not re.fullmatch(r'[a-f0-9]{40}',approved_sha) or approved_sha!=record['imageSourceCommit']:
        raise ValueError('Approved SHA must match the complete immutable image manifest')
    head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    dirty=subprocess.check_output(['git','status','--porcelain=v1'],cwd=ROOT,text=True).strip()
    if dirty or head!=approved_sha:
        raise ValueError('Clean checkout at the reviewed image-source SHA required; old release images do not include onboarding corrections')
    print('Reviewed image-source SHA matches the clean checkout. Verify CI, image IDs and operator authorization separately before any startup.')


def main():
    parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='action',required=True)
    init=sub.add_parser('prepare');init.add_argument('--directory',required=True);init.add_argument('--origin',required=True);init.add_argument('--images',required=True);init.add_argument('--https-port',type=int,default=3553);init.add_argument('--shared-proxy',action='store_true')
    show=sub.add_parser('plan');show.add_argument('--directory',required=True)
    public=sub.add_parser('prepare-public-candidate');public.add_argument('--directory',required=True);public.add_argument('--acme-email',required=True)
    verify=sub.add_parser('validate-release');verify.add_argument('--directory',required=True);verify.add_argument('--approved-sha',required=True)
    args=parser.parse_args()
    try:
        if args.action=='prepare':
            record=prepare(args.directory,args.origin,json.loads(Path(args.images).read_text()),args.https_port,args.shared_proxy)
            print('Prepared private configuration only. No Docker, VPS, database, DNS or account operation performed.')
            print('Project: '+record['project'])
        elif args.action=='plan':
            for command in plan(args.directory):print(shlex.join(command))
        elif args.action=='validate-release':
            validate_release(args.directory,args.approved_sha)
        else:
            prepare_public(args.directory,args.acme_email)
            print('Prepared review-only public candidate. No cutover, DNS, ACME or deployment operation performed.')
    except (ValueError, OSError, KeyError, json.JSONDecodeError) as error:
        raise SystemExit(str(error)) from None

if __name__=='__main__': main()
