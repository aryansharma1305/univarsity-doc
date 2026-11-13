#!/usr/bin/env python3
"""Fresh synthetic production-image coexistence/load/handoff test. Never accepts a live project.

CI runs natively on AMD64; --functional-only permits local emulation without capacity acceptance.
All data and credentials are generated here. No original university workbook or VPS is read.
"""
from concurrent.futures import ThreadPoolExecutor
import argparse
import base64
import copy
import http.client
import json
import os
from pathlib import Path
import secrets
import socket
import ssl
import tempfile
import threading
import time

from benchmark import cgroup, distribution, metrics
from runtime_regression import run, edge

THRESHOLDS={'p95_seconds':2.0,'p99_seconds':3.0,'error_rate':0,'cpu_cores_average':1.6,
            'container_memory_peak_mib':6144,'phase_seconds':120,'think_seconds':1.0,
            'import_seconds':120,'photo_seconds':10}


class Client:
    def __init__(self,port,origin,context,gate=None):
        self.port=port;self.origin=origin;self.host=origin.removeprefix('https://')
        self.context=context;self.gate=gate;self.cookies={};self.token=None
    def call(self,path,method='GET',data=None,raw=None,content_type=None,csrf=True,origin=None):
        headers={'Host':self.host,'Origin':origin or self.origin,'Connection':'close'}
        if self.gate:headers['Authorization']=self.gate
        if self.cookies:headers['Cookie']='; '.join(k+'='+v for k,v in self.cookies.items())
        if csrf and self.token:headers['X-CSRF-Token']=self.token
        body=json.dumps(data).encode() if data is not None else raw
        if body is not None:
            headers['Content-Length']=str(len(body));headers['Content-Type']=content_type or 'application/json'
        with socket.create_connection(('127.0.0.1',self.port),timeout=30) as sock:
            with self.context.wrap_socket(sock,server_hostname=self.host) as tls:
                request=f'{method} {path} HTTP/1.1\r\n'+''.join(k+': '+v+'\r\n' for k,v in headers.items())+'\r\n'
                tls.sendall(request.encode()+(body or b''));response=http.client.HTTPResponse(tls);response.begin()
                result=response.read()
                for key,value in response.getheaders():
                    if key.lower()=='set-cookie':
                        name,_,value=value.partition(';')[0].partition('=');self.cookies[name]=value
                result_headers={key.lower():value for key,value in response.getheaders()}
                result_headers['set-cookie']=[value for key,value in response.getheaders() if key.lower()=='set-cookie']
                return response.status,result_headers,result
    def json(self,path,method='GET',data=None,status=200,**kwargs):
        response=self.call(path,method,data,**kwargs)
        assert response[0]==status, f'Synthetic {method} {path.split("?")[0]} returned {response[0]}, expected {status}'
        return json.loads(response[2])
    def csrf(self,student=False):
        self.token=self.json('/api/v1/'+('student-auth' if student else 'auth')+'/csrf')['csrfToken']
    def login(self,account,student=False,activate=None):
        self.csrf(student)
        data={'registrationNumber':account['registrationNumber'],'password':account['password']} if student else account
        if activate:data={**data,'activationCode':activate}
        status,headers,body=self.call('/api/v1/'+('student-auth' if student else 'auth')+('/activate' if activate else '/login'),'POST',data)
        assert status==200,'Synthetic login/activation failed'
        expected='__Host-dv_student' if student else '__Host-dv_session'
        cookie=next((value for value in headers['set-cookie'] if value.startswith(expected+'=')),'')
        assert expected in self.cookies and all(flag.lower() in cookie.lower() for flag in ('Secure','HttpOnly','SameSite=Lax','Path=/'))
        assert 'domain=' not in cookie.lower()
        self.csrf(student)
        return json.loads(body)
    def clone(self):
        result=Client(self.port,self.origin,self.context,self.gate);result.cookies=self.cookies.copy();result.token=self.token
        return result


def multipart(fields,files):
    boundary='coexist'+secrets.token_hex(12);parts=[]
    for name,value in fields.items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    for name,filename,kind,content in files:
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\nContent-Type: {kind}\r\n\r\n'.encode()+content+b'\r\n')
    return b''.join(parts)+f'--{boundary}--\r\n'.encode(),'multipart/form-data; boundary='+boundary


def import_rows(client,directory):
    began=time.monotonic()
    raw,kind=multipart({'type':'STUDENTS'},[('file','synthetic-58.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',(directory/'fixtures/synthetic-58.xlsx').read_bytes())])
    response=client.call('/api/v1/imports','POST',raw=raw,content_type=kind);assert response[0]==201
    job=json.loads(response[2]);identifier=job['id']
    def wait(status):
        deadline=began+THRESHOLDS['import_seconds']
        while time.monotonic()<deadline:
            value=client.json('/api/v1/imports/'+identifier)
            if value['status']==status:return value
            assert value['status']!='FAILED','Synthetic import failed'
            time.sleep(.5)
        raise AssertionError('Synthetic import deadline exceeded')
    mapping=wait('MAPPING')
    client.json('/api/v1/imports/'+identifier+'/mapping','POST',{'worksheet':'Students','columns':mapping['sheets'][0]['suggestedMapping']})
    client.json('/api/v1/imports/'+identifier+'/validate','POST',{})
    validated=wait('VALIDATED');assert validated['counts']['errors']==0 and validated['counts']['create']==58
    client.json('/api/v1/imports/'+identifier+'/commit','POST',{'applyUpdates':False})
    finished=wait('COMPLETED');assert finished['counts']['created']==58 and finished['counts']['imported']==58
    return {'seconds':round(time.monotonic()-began,3),'created':58,'errors':0}


def profile(client,registrar,directory):
    raw,kind=multipart({'changes':json.dumps({'dateOfBirth':'2005-02-03'})},[('photo','synthetic.png','image/png',(directory/'fixtures/synthetic-photo.png').read_bytes())])
    began=time.monotonic();response=client.call('/api/v1/student/profile-requests','POST',raw=raw,content_type=kind)
    assert response[0]==201,'Synthetic profile submission failed'
    value=json.loads(response[2]);identifier=value['id']
    registrar.json('/api/v1/profile-requests/'+identifier+'/approve','POST',{})
    response=client.call('/api/v1/student/photo');assert response[0]==200 and response[1].get('cache-control')=='no-store'
    seconds=time.monotonic()-began;assert seconds<=THRESHOLDS['photo_seconds'],'Synthetic photo deadline exceeded'
    return {'seconds':round(seconds,3),'input_bytes':(directory/'fixtures/synthetic-photo.png').stat().st_size}


def load(clients,commands):
    samples={'stage':[],'university':[]};errors=0;timeouts=0;lock=threading.Lock()
    services=('api','worker','postgres','redis','minio')
    def resources():
        return {label+'/'+name:cgroup(command,name) for label,command,web in commands for name in (*services,web)}
    def restarts():
        return {label+'/'+name:int(run('docker','inspect','--format','{{.RestartCount}}',command('ps','--quiet',name).stdout.strip()).stdout)
                for label,command,web in commands for name in (*services,web)}
    initial_restarts=restarts();before=resources();start=time.monotonic();deadline=start+THRESHOLDS['phase_seconds']
    def actor(label,client,paths):
        nonlocal errors,timeouts
        i=0
        while time.monotonic()<deadline:
            began=time.monotonic();failed=False;timed=False
            try:failed=client.call(paths[i%len(paths)])[0]!=200
            except (OSError,TimeoutError):failed=True;timed=True
            with lock:
                samples[label].append(time.monotonic()-began);errors+=int(failed);timeouts+=int(timed)
            i+=1;time.sleep(THRESHOLDS['think_seconds'])
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures=[pool.submit(actor,label,client.clone(),paths) for label,client,paths in clients]
        for future in futures:future.result()
    elapsed=time.monotonic()-start;after=resources()
    per_service={name:metrics(before[name],after[name],elapsed) for name in before}
    return {'seconds':round(elapsed,3),'concurrency':{'stage':2,'university':8},
            'latency_seconds':{k:distribution(v) for k,v in samples.items()},
            'throughput_rps':round(sum(map(len,samples.values()))/elapsed,3),
            'errors':errors,'timeouts':timeouts,'requests':sum(map(len,samples.values())),
            'services':per_service,'restarts_during_load':{name:value-initial_restarts[name] for name,value in restarts().items()},'cpu_cores_average':sum(v['cpu_cores_average'] for v in per_service.values()),
            'sum_container_peak_mib':sum(v['memory_peak_since_start_mib'] for v in per_service.values()),
            'raw_latency_seconds':samples}


def main(images,functional_only=False):
    if not functional_only and (os.environ.get('GITHUB_ACTIONS')!='true' or os.environ.get('RUNNER_ENVIRONMENT')!='github-hosted'):
        raise SystemExit('Native load acceptance requires a fresh GitHub-hosted runner; local emulation is functional-only')
    endpoint=run('docker','context','inspect','--format','{{.Endpoints.docker.Host}}').stdout.strip()
    assert not os.environ.get('DOCKER_HOST') and endpoint.startswith('unix://')
    manifest=json.loads(Path(images).read_text());edge.clean.image_ids(manifest)
    sha=run('git','-C',str(edge.ROOT),'rev-parse','HEAD').stdout.strip();assert manifest['commit']==sha
    for value in manifest['images'].values():
        actual=json.loads(run('docker','image','inspect','--format','{"id":{{json .Id}},"arch":{{json .Architecture}},"os":{{json .Os}}}',value['reference']).stdout)
        assert actual=={'id':value['id'],'arch':'amd64','os':'linux'}
    engine=json.loads(run('docker','info','--format','{"architecture":{{json .Architecture}},"cpus":{{.NCPU}},"memory_bytes":{{.MemTotal}}}').stdout)
    if not functional_only:assert engine['architecture']=='x86_64'
    report={'source_sha':sha,'image_source_sha':manifest['commit'],'engine':engine,'functional_only':functional_only,'thresholds':THRESHOLDS,
            'scope':'Fresh synthetic production images; two server CPUs pinned, individual memory caps; not a complete VPS/OS simulation',
            'checks':[]}
    if functional_only:report['emulation_only_adjustments']={'cpu_floor':.5,'health_timeout':'60s','health_interval':'5s'}
    commands=[]
    with tempfile.TemporaryDirectory() as folder:
        root=Path(folder).resolve();root.chmod(0o755)
        try:
            instances={}
            for label in ('STAGE','UNIVERSITY'):
                directory=root/label.lower();origin='https://'+('review' if label=='STAGE' else 'university')+'.example.invalid'
                record=edge.clean.prepare(directory,origin,manifest,shared_proxy=True)
                config=json.loads((directory/'compose.json').read_text());web=record['webService']
                if label=='STAGE':config['services']['web']=config['services'].pop(web);web='web'
                for name,service in config['services'].items():
                    service['cpuset']='0,1'
                    if name in ('api','worker',web,'postgres','redis','minio'):
                        role='web' if name==web else name
                        if label=='STAGE':
                            memory,cpu=edge.STAGING_LIMITS[role];service.update(mem_limit=f'{memory}m',memswap_limit=f'{memory}m',cpus=cpu,cpu_shares=128)
                credentials=directory/'fixtures';credentials.mkdir(mode=0o700)
                password=lambda:secrets.token_urlsafe(24)+'Aa9!'
                fixture={'marker':'SYNTHETIC COEXISTENCE ONLY','label':label,
                         'staff':{role:{'email':role.lower()+'@'+label.lower()+'.example.invalid','password':password()} for role in ('SUPER_ADMIN','REGISTRAR','EXAM_ADMIN')},
                         'students':[{'registrationNumber':'COEX-'+label+'-SEED-'+str(i),'password':password()} for i in range(2)]}
                (credentials/'fixture.json').write_text(json.dumps(fixture));(credentials/'fixture.json').chmod(0o600)
                tool=copy.deepcopy(config['services']['check-empty'])
                tool.update(user=f'{os.getuid()}:{os.getgid()}',command=['node','/operations/full_stack_fixture.mjs','seed'],
                            environment={'SYNTHETIC_COEXIST':'true','LOCAL_UID':str(os.getuid()),'LOCAL_GID':str(os.getgid())},
                            secrets=[{'source':'runtime','target':'runtime'}],
                            volumes=[f'{edge.ROOT}/deploy/coexist:/operations:ro',f'{credentials}:/credentials'])
                config['services']['fixture-tool']=tool
                for service in config['services'].values():
                    if service['image'] in {v['id'] for v in manifest['images'].values()}:service['platform']='linux/amd64'
                    if functional_only:
                        service['cpus']=max(.5,service.get('cpus',.5))
                        if service.get('healthcheck',{}).get('test'):
                            service['healthcheck'].update(timeout='60s',interval='5s',start_period='5s')
                (directory/'compose.json').write_text(json.dumps(config))
                project=record['project']
                assert not run('docker','volume','ls','-q','--filter','label=com.docker.compose.project='+project).stdout.strip()
                def command(*args,d=directory,p=project):return run('docker','compose','-p',p,'-f',str(d/'compose.json'),*args,timeout=240)
                commands.append((label.lower(),command,web))
                print('Preparing fresh synthetic '+label+' data services',flush=True)
                command('up','--pull','never','--no-build','-d','--wait','postgres','redis','minio')
                command('--profile','operator','run','--rm','--no-deps','migrate')
                command('--profile','operator','run','--rm','--no-deps','check-empty')
                command('--profile','operator','run','--rm','--no-deps','fixture-tool')
                print('Starting synthetic '+label+' application services',flush=True)
                fixture=json.loads((credentials/'fixture.json').read_text())
                command('up','--pull','never','--no-build','-d','--wait','api','worker',web)
                instances[label]={'directory':directory,'command':command,'record':record,'web':web,'fixture':fixture,'origin':origin}
            for item in instances.values():
                project=item['record']['project'];command=item['command']
                assert run('docker','network','inspect','--format','{{.Internal}}',project+'_backend').stdout.strip()=='true'
                for name in ('api','worker',item['web'],'postgres','redis','minio'):
                    identifier=command('ps','--quiet',name).stdout.strip()
                    assert not json.loads(run('docker','inspect','--format','{{json .HostConfig.PortBindings}}',identifier).stdout)
            report['checks'].append('independent fresh migrations, emptiness, private backends and no application/data published ports')
            # Only this test edge publishes a loopback port. Neither application publishes a service.
            configdir=root/'edge';configdir.mkdir(mode=0o755)
            gate_password=secrets.token_urlsafe(24)
            hashed=run('docker','run','--rm','-i','--network','none',edge.clean.PINS['proxy'],'caddy','hash-password',input=gate_password+'\n').stdout.strip().splitlines()[-1]
            gate=configdir/'gate';gate.write_text(f'(reviewer_gate) {{\n\tbasic_auth @gated {{\n\t\treviewer {hashed}\n\t}}\n}}\n');gate.chmod(0o444)
            policy=edge.caddyfile(instances['STAGE']['origin'],instances['UNIVERSITY']['origin'],instances['UNIVERSITY']['web'],'ops@example.invalid')
            for item in instances.values():policy=policy.replace(item['origin'].removeprefix('https://')+' {',item['origin'].removeprefix('https://')+' {\n tls internal')
            (configdir/'Caddyfile').write_text(policy)
            (configdir/'legacy').write_text('{\n admin off\n}\nimport /run/secrets/reviewer_gate\nhttps://review.example.invalid {\n tls internal\n import /etc/caddy/review-site.caddy\n}\n')
            for name in ('review-site.caddy','start.sh'):
                source=edge.ROOT/('deploy/review-site.caddy' if name=='review-site.caddy' else 'deploy/coexist/start.sh')
                (configdir/name).write_bytes(source.read_bytes())
            with socket.socket() as available:available.bind(('127.0.0.1',0));port=available.getsockname()[1]
            stage=instances['STAGE']['record']['project'];uni=instances['UNIVERSITY']['record']['project'];edge_project='dvfulledge'+secrets.token_hex(5)
            proxy={'image':edge.clean.PINS['proxy'],'entrypoint':['/bin/sh','/etc/caddy/start.sh'],'command':[],
                   'networks':['listener','stage_backend','stage_edge','uni_edge'],
                   'volumes':[f'{configdir}:/etc/caddy:ro',f'{gate}:/run/secrets/reviewer_gate:ro','certificates:/data','config:/config'],
                   'ports':[f'127.0.0.1:{port}:443'],'read_only':True,'tmpfs':['/tmp:size=16m'],'cap_drop':['ALL'],
                   'cap_add':['NET_BIND_SERVICE'],'security_opt':['no-new-privileges:true'],'cpus':edge.EDGE_CPUS,'cpu_shares':edge.EDGE_CPU_SHARES,'cpuset':'0,1',
                   'mem_limit':'128m','memswap_limit':'128m','pids_limit':128,'restart':'no'}
            legacy={**copy.deepcopy(proxy),'entrypoint':['caddy'],'command':['run','--config','/etc/caddy/legacy','--adapter','caddyfile'],'networks':['listener','stage_backend','stage_edge']}
            model={'name':edge_project,'services':{'edge':proxy,'legacy':legacy},'networks':{'listener':{},
                   'stage_backend':{'external':True,'name':stage+'_backend'},'stage_edge':{'external':True,'name':stage+'_edge'},
                   'uni_edge':{'external':True,'name':uni+'_edge'}},'volumes':{'certificates':{},'config':{}}}
            (configdir/'compose.json').write_text(json.dumps(model))
            def e(*args):return run('docker','compose','-p',edge_project,'-f',str(configdir/'compose.json'),*args)
            commands.append(('edge',e,'edge'))
            context=ssl.create_default_context()
            auth='Basic '+base64.b64encode(('reviewer:'+gate_password).encode()).decode()
            stage_client=Client(port,instances['STAGE']['origin'],context,auth)
            uni_client=Client(port,instances['UNIVERSITY']['origin'],context)
            def ready(service):
                deadline=time.monotonic()+60
                while time.monotonic()<deadline:
                    try:
                        e('cp',service+':/data/caddy/pki/authorities/local/root.crt',str(root/'ca.crt'))
                        context.load_verify_locations(str(root/'ca.crt'))
                        anonymous=stage_client.clone();anonymous.gate=None
                        if anonymous.call('/')[0]==401:return
                    except (OSError,RuntimeError):pass
                    time.sleep(.5)
                raise AssertionError('Protected full-stack edge did not start')
            e('up','--pull','never','--no-build','-d','legacy');ready('legacy')
            assert stage_client.call('/health')[0]==200
            before={label:{s:c('ps','--quiet',s).stdout.strip() for s in ('api','worker',web,'postgres','redis','minio')} for label,c,web in commands if label!='edge'}
            e('stop','legacy');e('up','--pull','never','--no-build','--no-deps','-d','edge');ready('edge')
            assert stage_client.call('/health')[0]==200 and uni_client.call('/')[0]==200
            edge_identifier=e('ps','--quiet','edge').stdout.strip()
            attached=json.loads(run('docker','inspect','--format','{{json .NetworkSettings.Networks}}',edge_identifier).stdout)
            assert uni+'_backend' not in attached and stage+'_backend' in attached and uni+'_edge' in attached
            report['checks'].append('real application listener/certificate handoff')
            staff={};students={}
            for label,base in (('STAGE',stage_client),('UNIVERSITY',uni_client)):
                fixture=instances[label]['fixture'];staff[label]={}
                for role,account in fixture['staff'].items():
                    client=base.clone();client.login(account);staff[label][role]=client
                registrar=staff[label]['REGISTRAR']
                assert staff[label]['EXAM_ADMIN'].call('/api/v1/imports')[0]==403
                assert registrar.call('/api/v1/imports')[0]==200
                assert registrar.call('/api/v1/departments','POST',{'code':'DENIED','name':'SYNTHETIC'},csrf=False)[0]==403
                assert registrar.call('/api/v1/departments','POST',{'code':'DENIED','name':'SYNTHETIC'},origin='https://evil.invalid')[0]==403
                issued=registrar.json('/api/v1/student-accounts/activation-codes','POST',{'registrationIds':[s['registrationId'] for s in fixture['students']]})
                students[label]=[]
                for account,code in zip(fixture['students'],issued['issued'],strict=True):
                    selected=next(c for c in issued['issued'] if c['registrationNumber']==account['registrationNumber'])
                    client=base.clone();client.login(account,student=True,activate=selected['code']);students[label].append(client)
                    assert client.call('/api/v1/auth/me')[0]==401
                assert registrar.call('/api/v1/student/me')[0]==401
            foreign=uni_client.clone();foreign.cookies=staff['STAGE']['SUPER_ADMIN'].cookies.copy()
            assert foreign.call('/api/v1/auth/me')[0]==401
            foreign=uni_client.clone();foreign.cookies=students['STAGE'][0].cookies.copy()
            assert foreign.call('/api/v1/student/me')[0]==401
            for path in ('/','/health','/api/v1/auth/me','/student/profile'):
                anonymous=stage_client.clone();anonymous.gate=None
                assert anonymous.call(path)[0]==401
            report['checks'].append('Basic Auth, secure sessions, activation, CSRF, RBAC and cross-environment cookie refusal')
            for item in instances.values():item['command']('--profile','operator','run','--rm','--no-deps','fixture-tool','node','/operations/full_stack_fixture.mjs','verify')
            for label,foreign_label in (('STAGE','UNIVERSITY'),('UNIVERSITY','STAGE')):
                item=instances[label]
                foreign=item['directory']/'fixtures/foreign-runtime'
                foreign.write_bytes((instances[foreign_label]['directory']/'secrets/runtime').read_bytes());foreign.chmod(0o600)
                item['command']('--profile','operator','run','--rm','--no-deps','fixture-tool','node','/operations/full_stack_fixture.mjs','verify-foreign')
                foreign.unlink()
            report['checks'].append('independent PostgreSQL and private-object canaries')
            report['checks'].append('PostgreSQL, Redis and MinIO refuse foreign environment credentials in both directions')
            clients=[]
            for _ in range(2):clients.append(('stage',staff['STAGE']['REGISTRAR'],('/admin/students','/api/v1/students?pageSize=10')))
            for _ in range(4):clients.append(('university',staff['UNIVERSITY']['REGISTRAR'],('/admin/students','/api/v1/students?pageSize=10')))
            for i in range(4):clients.append(('university',students['UNIVERSITY'][i%2],('/student/profile','/api/v1/student/me')))
            # Import and two independent photo/DOB approvals overlap the HTTP load.
            with ThreadPoolExecutor(max_workers=4) as pool:
                workload=pool.submit(load,clients,commands[:2])
                import_future=pool.submit(import_rows,staff['UNIVERSITY']['REGISTRAR'].clone(),instances['UNIVERSITY']['directory'])
                photos=[pool.submit(profile,student.clone(),staff['UNIVERSITY']['REGISTRAR'].clone(),instances['UNIVERSITY']['directory']) for student in students['UNIVERSITY']]
                edge_before=cgroup(e);began=time.monotonic()
                report['import']=import_future.result();report['photos']=[f.result() for f in photos]
                report['load']=workload.result();edge_after=cgroup(e)
                report['load']['services']['edge']=metrics(edge_before,edge_after,time.monotonic()-began)
            values=report['load'];values['cpu_cores_average']+=values['services']['edge']['cpu_cores_average'];values['sum_container_peak_mib']+=values['services']['edge']['memory_peak_since_start_mib']
            report['load_acceptance']=all(v['p95']<=THRESHOLDS['p95_seconds'] and v['p99']<=THRESHOLDS['p99_seconds'] for v in values['latency_seconds'].values()) and not values['errors'] and not values['timeouts'] and values['cpu_cores_average']<=THRESHOLDS['cpu_cores_average'] and values['sum_container_peak_mib']<=THRESHOLDS['container_memory_peak_mib'] and all(v['oom_kills']==0 for v in values['services'].values()) and not any(values['restarts_during_load'].values())
            if not functional_only:assert report['load_acceptance'],'Full-stack load thresholds failed'
            edge_id=e('ps','--quiet','edge').stdout.strip()
            c=instances['STAGE']['command'];c('stop',instances['STAGE']['web'],'api','worker')
            assert uni_client.call('/')[0]==200 and e('ps','--quiet','edge').stdout.strip()==edge_id
            c('up','--pull','never','--no-build','-d','--wait','api','worker',instances['STAGE']['web'])
            e('stop','edge');e('start','legacy');ready('legacy')
            assert stage_client.call('/health')[0]==200 and staff['STAGE']['REGISTRAR'].call('/api/v1/auth/me')[0]==200
            anonymous=stage_client.clone();anonymous.gate=None;assert anonymous.call('/')[0]==401
            after={label:{s:c('ps','--quiet',s).stdout.strip() for s in ('api','worker',web,'postgres','redis','minio')} for label,c,web in commands if label!='edge'}
            assert before==after
            report['checks'].append('staging maintenance preserves university; rollback keeps protected authenticated access and unchanged data/application IDs')
            report['result']='passed';report['capacity_accepted']=bool(report['load_acceptance'] and not functional_only)
        except Exception as error:
            report['result']='failed';report['failure_type']=type(error).__name__
            raise
        finally:
            for label,command,_ in reversed(commands):
                try:command('stop','--timeout','30')
                except Exception:report.setdefault('cleanup_failures',[]).append(label)
            output=edge.ROOT/'test-results/coexist-full-stack.json';output.parent.mkdir(parents=True,exist_ok=True)
            output.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='load'},indent=2))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--images',required=True);parser.add_argument('--functional-only',action='store_true')
    args=parser.parse_args();main(args.images,args.functional_only)
