#!/usr/bin/env python3
"""Synthetic transport rehearsal: private disposable networks, loopback HTTPS, no real app/data.

Requires local Docker. Retains its own certificate volumes and aggregate evidence; never uses VPS
state. Internal TLS is the sole site-policy substitution; production ACME needs external acceptance.
"""
from concurrent.futures import ThreadPoolExecutor
import argparse
import base64
import copy
import http.client
import importlib.util
import ipaddress
import json
import os
from pathlib import Path
import secrets
import socket
import ssl
import subprocess
import tempfile
import time

spec=importlib.util.spec_from_file_location('coexist_prepare',Path(__file__).with_name('prepare.py'))
edge=importlib.util.module_from_spec(spec)
spec.loader.exec_module(edge)


def run(*args, timeout=120, **kwargs):
    try:
        return subprocess.run(args,check=True,capture_output=True,text=True,timeout=timeout,**kwargs)
    except subprocess.CalledProcessError as error:
        raise RuntimeError(error.stderr.strip()) from None


def main(probe_cpu=None,benchmark=False,selected_only=False,probe_shares=None,probe_contention=False):
    endpoint=run('docker','context','inspect','--format','{{.Endpoints.docker.Host}}').stdout.strip()
    if os.environ.get('DOCKER_HOST') or not endpoint.startswith('unix://'):
        raise SystemExit('Runtime rehearsal requires the local Unix-socket Docker context')
    project='dvcoexist'+secrets.token_hex(5)
    network_ids=run('docker','network','ls','-q').stdout.split()
    existing=json.loads(run('docker','network','inspect',*network_ids).stdout)
    occupied=[ipaddress.ip_network(c['Subnet']) for n in existing for c in (n['IPAM'].get('Config') or []) if c.get('Subnet')]
    subnets=iter(n for n in ipaddress.ip_network('10.254.0.0/16').subnets(new_prefix=28)
                 if not any(n.version==used.version and n.overlaps(used) for used in occupied))
    networks={n:{'internal':n!='listener','ipam':{'config':[{'subnet':str(next(subnets))}]}}
              for n in ('stage_edge','stage_backend','university_edge','university_backend','listener')}
    with socket.socket() as available:
        available.bind(('127.0.0.1',0));port=available.getsockname()[1]
    password=secrets.token_urlsafe(24)
    gate_hash=run('docker','run','--rm','-i','--network','none',edge.clean.PINS['proxy'],
                  'caddy','hash-password',input=password+'\n').stdout.strip().splitlines()[-1]
    authorization='Basic '+base64.b64encode(('reviewer:'+password).encode()).decode()
    report={'project':project,'scope':'Synthetic Caddy transport fixtures; not application UAT or VPS capacity','checks':[]}
    with tempfile.TemporaryDirectory() as folder:
        root=Path(folder);root.chmod(0o755)
        config=root/'config';config.mkdir(mode=0o755)
        gate=root/'gate';gate.write_text(f'(reviewer_gate) {{\n\tbasic_auth @gated {{\n\t\treviewer {gate_hash}\n\t}}\n}}\n');gate.chmod(0o444)
        policy=edge.caddyfile('https://review.example.invalid','https://university.example.invalid','uniweb-12345678','ops@example.invalid')
        for host in ('review.example.invalid','university.example.invalid'):
            policy=policy.replace(host+' {',host+' {\n    tls internal')
        site=config/'Caddyfile';site.write_text(policy);site.chmod(0o444)
        (config/'review-site.caddy').write_bytes((edge.ROOT/'deploy/review-site.caddy').read_bytes())
        (config/'start.sh').write_bytes(Path(__file__).with_name('start.sh').read_bytes())
        legacy=config/'legacy.caddy'
        legacy.write_text('{\n admin off\n}\nimport /run/secrets/reviewer_gate\nhttps://review.example.invalid {\n tls internal\n import /etc/caddy/review-site.caddy\n}\n')
        common={'image':edge.clean.PINS['proxy'],'read_only':True,'tmpfs':['/tmp:size=16m'],
                'cap_drop':['ALL'],'cap_add':['NET_BIND_SERVICE'],'security_opt':['no-new-privileges:true'],'mem_limit':'128m',
                'memswap_limit':'128m','cpus':.1,'cpuset':'0,1','pids_limit':128,'restart':'no',
                'logging':{'driver':'json-file','options':{'max-size':'2m','max-file':'1'}}}
        def fixture(name, listen, response, networks):
            path=config/(name+'.caddy')
            path.write_text('{\n admin off\n auto_https off\n}\n:'+str(listen)+' {\n respond "'+response+'"\n}\n')
            return {**copy.deepcopy(common),'command':['caddy','run','--config','/fixture.caddy','--adapter','caddyfile'],
                    'networks':networks,'volumes':[f'{path}:/fixture.caddy:ro']}
        services={
            'stageweb':fixture('stageweb',3000,'staging',{'stage_edge':{'aliases':['web']},'stage_backend':{}}),
            'stageapi':fixture('stageapi',4000,'staging-api',{'stage_backend':{'aliases':['api']}}),
            'uniweb-12345678':fixture('uniweb',3000,'university',{'university_edge':{},'university_backend':{}}),
            'stage-private':fixture('stage-private',9000,'stage-private',{'stage_backend':{}}),
            'uni-private':fixture('uni-private',9000,'uni-private',{'university_backend':{}}),
        }
        proxy={**copy.deepcopy(common),'cap_add':['NET_BIND_SERVICE'],
               'entrypoint':['/bin/sh','/etc/caddy/start.sh'],'command':[],
               'ports':[f'127.0.0.1:{port}:443'],
               'networks':['listener','stage_edge','stage_backend','university_edge'],
               'volumes':[f'{config}:/etc/caddy:ro',f'{gate}:/run/secrets/reviewer_gate:ro','certificates:/data','caddy_config:/config']}
        proxy['cpus']=probe_cpu if probe_cpu is not None else getattr(edge,'EDGE_CPUS',.1)
        proxy['cpu_shares']=probe_shares if probe_shares is not None else getattr(edge,'EDGE_CPU_SHARES',1024)
        services['edge']=proxy
        services['legacy']={**copy.deepcopy(proxy),'entrypoint':['caddy'],
                            'command':['run','--config','/etc/caddy/legacy.caddy','--adapter','caddyfile'],
                            'networks':['listener','stage_edge','stage_backend']}
        for name in ('burn-a','burn-b'):
            services[name]={'image':edge.clean.PINS['proxy'],'entrypoint':['/bin/sh','-c'],
                            'command':['while :; do :; done'],'network_mode':'none',
                            'cpus':.4,'cpu_shares':1920,'cpuset':'0,1','mem_limit':'16m','memswap_limit':'16m',
                            'read_only':True,'cap_drop':['ALL'],'security_opt':['no-new-privileges:true'],'pids_limit':4}
        compose=root/'compose.json'
        compose.write_text(json.dumps({'name':project,'services':services,
            'networks':networks,
            'volumes':{'certificates':{},'caddy_config':{}}}))
        def command(*args):return run('docker','compose','-p',project,'-f',str(compose),*args)
        def identity(service):return command('ps','--all','--quiet',service).stdout.strip()
        context=ssl.create_default_context()
        def request(host='review.example.invalid',path='/',auth=None,host_header=None,timeout=30):
            with socket.create_connection(('127.0.0.1',port),timeout=timeout) as raw:
                with context.wrap_socket(raw,server_hostname=host) as tls:
                    headers=f'GET {path} HTTP/1.1\r\nHost: {host_header or host}\r\nConnection: close\r\n'
                    if auth:headers+='Authorization: '+auth+'\r\n'
                    tls.sendall((headers+'\r\n').encode())
                    response=http.client.HTTPResponse(tls);response.begin()
                    return response.status,response.read().decode()
        def wait_ready(service):
            deadline=time.monotonic()+30
            while time.monotonic()<deadline:
                try:
                    command('cp',service+':/data/caddy/pki/authorities/local/root.crt',str(root/'ca.crt'))
                    context.load_verify_locations(str(root/'ca.crt'))
                    if request()[0]==401:return
                except (OSError,ssl.SSLError,RuntimeError):pass
                time.sleep(.2)
            raise AssertionError('Synthetic HTTPS did not become protected and ready')
        def wait_reload(expected):
            # A graceful listener replacement can close a connection accepted by the old listener.
            deadline=time.monotonic()+15
            while time.monotonic()<deadline:
                try:
                    if request('university.example.invalid','/reload-probe',timeout=2)==(200,expected):return
                except (OSError,http.client.HTTPException):pass
                time.sleep(.2)
            raise AssertionError('Reload did not serve the expected configuration within 15 seconds')
        def check_gate():
            for path in ('/','/health','/api/v1/auth/me','/student/login','/download/private'):
                assert request(path=path)[0]==401
                assert request(path=path,auth='Basic d3Jvbmc6d3Jvbmc=')[0]==401
            assert request(path='/robots.txt')[0]==200
            start=time.monotonic()
            assert request(auth=authorization)==(200,'staging')
            report.setdefault('first_authenticated_request_seconds',[]).append(round(time.monotonic()-start,3))
            assert request(path='/health',auth=authorization)==(200,'staging-api')
        try:
            command('up','--pull','never','--no-build','-d','stageweb','stageapi','uniweb-12345678','stage-private','uni-private','edge' if probe_cpu is not None or benchmark else 'legacy')
            if benchmark:
                from benchmark import run_suite
                wait_ready('edge')
                output=edge.ROOT/'test-results/coexist-benchmark.json'
                report=run_suite(request,command,authorization,wait_ready,output,proxy['cpus'],selected_only=selected_only)
                return
            if probe_cpu is not None:
                if probe_contention:command('up','--pull','never','--no-build','-d','burn-a','burn-b')
                wait_ready('edge')
                def cpu_stat():
                    return {k:int(v) for k,v in (line.split() for line in command('exec','-T','edge','cat','/sys/fs/cgroup/cpu.stat').stdout.splitlines())}
                before=cpu_stat();latencies=[]
                for auth in (authorization,authorization,None):
                    start=time.monotonic()
                    assert request('review.example.invalid' if auth else 'university.example.invalid',auth=auth)[0]==200
                    latencies.append(round(time.monotonic()-start,3))
                after=cpu_stat()
                report.update(cpu=probe_cpu,cpu_shares=proxy['cpu_shares'],contention=probe_contention,cold_seconds=latencies[0],warm_seconds=latencies[1],university_seconds=latencies[2],
                              cpu_delta={k:after[k]-before[k] for k in before})
                print(json.dumps(report,indent=2),flush=True)
                assert latencies[0]<=2, 'Cold reviewer authentication exceeds the predefined 2-second limit'
                return
            wait_ready('legacy');check_gate()
            report['checks'].append('legacy HTTPS and reviewer gate')
            before={s:identity(s) for s in ('stageweb','stageapi','uniweb-12345678')}
            command('stop','legacy');command('up','--pull','never','--no-build','--no-deps','-d','edge')
            wait_ready('edge');check_gate()
            assert before=={s:identity(s) for s in before}
            report['checks'].append('controlled port/certificate handoff; unchanged application container IDs')
            assert request('university.example.invalid')==(200,'university')
            assert request('university.example.invalid',host_header='review.example.invalid')[0]==421
            with ThreadPoolExecutor(max_workers=4) as executor:
                futures=[executor.submit(request,'university.example.invalid') for _ in range(8)]
                futures += [executor.submit(request,auth=authorization) for _ in range(2)]
                assert all(f.result()[0]==200 for f in futures)
            report['checks'].append('concurrent two-site smoke and SNI/Host mismatch refusal')
            for source,target,permitted in [('edge','uni-private',False),('stageweb','uni-private',False),
                                             ('uniweb-12345678','stage-private',False),('uniweb-12345678','uni-private',True)]:
                result=subprocess.run(['docker','compose','-p',project,'-f',str(compose),'exec','-T',source,
                    'wget','-T','2','-qO-','http://'+target+':9000'],capture_output=True,timeout=8)
                assert (result.returncode==0)==permitted,(source,target)
            report['checks'].append('private backend reachability and cross-environment denial')
            edge_id=identity('edge')
            command('stop','stageweb','stageapi')
            assert request('university.example.invalid')==(200,'university')
            assert identity('edge')==edge_id
            command('up','--pull','never','--no-build','--no-deps','-d','stageweb','stageapi')
            report['checks'].append('staging maintenance preserves university and edge')
            site.chmod(0o600);site.write_text(policy.replace('    reverse_proxy uniweb-', '    respond /reload-probe "reloaded"\n    reverse_proxy uniweb-'));site.chmod(0o444)
            command('kill','-s','USR1','edge')
            wait_reload('reloaded')
            assert identity('edge')==edge_id
            site.chmod(0o600);site.write_text(policy);site.chmod(0o444)
            command('kill','-s','USR1','edge');wait_reload('university');check_gate()
            report['checks'].append('admin-off USR1 reload and graceful configuration rollback')
            command('stop','edge')
            original=gate.read_text();gate.chmod(0o600);gate.write_text('(reviewer_gate) {\n}\n');gate.chmod(0o444)
            command('start','edge');time.sleep(1)
            state=run('docker','inspect','--format','{{.State.Running}} {{.State.ExitCode}}',edge_id).stdout.strip()
            assert state=='false 1',state
            gate.chmod(0o600);gate.write_text(original);gate.chmod(0o444)
            report['checks'].append('container restart rejects syntactically empty gate')
            command('start','legacy');wait_ready('legacy');check_gate()
            assert before=={s:identity(s) for s in before}
            report['checks'].append('port ownership rollback preserves staging gate, certificates and applications')
            report['result']='passed'
        finally:
            command('stop','--timeout','10')
            if not benchmark:
                target=edge.ROOT/('test-results/coexist-probe.json' if probe_cpu is not None else 'test-results/coexistence.json');target.parent.mkdir(parents=True,exist_ok=True)
                target.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--probe-cpu',type=float,choices=(.1,.25,.5,1.0))
    parser.add_argument('--benchmark',action='store_true')
    parser.add_argument('--benchmark-selected',action='store_true')
    parser.add_argument('--probe-shares',type=int,choices=(1024,4096))
    parser.add_argument('--probe-contention',action='store_true')
    args=parser.parse_args()
    main(args.probe_cpu,args.benchmark or args.benchmark_selected,args.benchmark_selected,args.probe_shares,args.probe_contention)
