"""Repeatable pinned-Caddy CPU experiment, used by runtime_regression.py --benchmark.

No credential, header, response body or private workload data is retained. Percentiles use nearest
rank; five cold samples describe observed maxima, not a population-tail guarantee.
"""
from concurrent.futures import ThreadPoolExecutor
import json
import math
import threading
import time

CANDIDATES=(.1,.25,.5,1.0)
THRESHOLDS={
    'cold_p95_seconds':2.0,'cold_p99_seconds':3.0,
    'warm_p95_seconds':.250,'warm_p99_seconds':.500,
    'throughput_rps':20.0,'errors':0,'edge_memory_peak_mib':96,
    'contention_cpu_cores':.8,
}


def distribution(values):
    ordered=sorted(values)
    if not ordered:return {'samples':0,'p50':None,'p95':None,'p99':None,'max':None}
    def percentile(p):return round(ordered[max(0,math.ceil(len(ordered)*p)-1)],6)
    return {'samples':len(ordered),'p50':percentile(.5),'p95':percentile(.95),
            'p99':percentile(.99),'max':round(ordered[-1],6)}


def cgroup(command,service='edge'):
    text=command('exec','-T',service,'/bin/sh','-c',
        'cat /sys/fs/cgroup/cpu.stat; printf "memory_current "; cat /sys/fs/cgroup/memory.current; '
        'printf "memory_peak "; cat /sys/fs/cgroup/memory.peak; '
        'cat /sys/fs/cgroup/memory.events').stdout
    return {key:int(value) for key,value in (line.split() for line in text.splitlines())}


def metrics(before,after,seconds):
    return {'cpu_cores_average':round((after['usage_usec']-before['usage_usec'])/(seconds*1e6),4),
            'cpu_seconds':round((after['usage_usec']-before['usage_usec'])/1e6,4),
            'throttled_periods':after['nr_throttled']-before['nr_throttled'],
            'periods':after['nr_periods']-before['nr_periods'],
            'throttled_seconds':round((after['throttled_usec']-before['throttled_usec'])/1e6,4),
            'memory_current_mib':round(after['memory_current']/1024**2,3),
            'memory_peak_since_start_mib':round(after['memory_peak']/1024**2,3),
            'oom_kills':after['oom_kill']-before['oom_kill']}


def load(request,command,authorization,duration,think=.1):
    before=cgroup(command);start=time.monotonic();deadline=start+duration
    lock=threading.Lock();samples={'reviewer':[],'university':[]};errors={'reviewer':0,'university':0};timeouts=0
    def worker(role):
        nonlocal timeouts
        host='review.example.invalid' if role=='reviewer' else 'university.example.invalid'
        auth=authorization if role=='reviewer' else None
        while time.monotonic()<deadline:
            began=time.monotonic();failed=False;timed_out=False
            try:failed=request(host,auth=auth)[0]!=200
            except (OSError,TimeoutError):failed=True;timed_out=True
            elapsed=time.monotonic()-began
            with lock:
                samples[role].append(elapsed);errors[role]+=int(failed);timeouts+=int(timed_out)
            time.sleep(think)
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures=[pool.submit(worker,role) for role in ['reviewer']*2+['university']*8]
        for future in futures:future.result()
    elapsed=time.monotonic()-start;after=cgroup(command);count=sum(map(len,samples.values()))
    return {'requested_duration_seconds':duration,'observed_seconds':round(elapsed,3),
            'concurrency':{'reviewer':2,'university':8},'think_seconds':think,
            'connections':'new verified TLS connection per request; HTTP/1.1; no intentional TLS session reuse',
            'latency_seconds':{role:distribution(values) for role,values in samples.items()},
            'requests':count,'throughput_rps':round(count/elapsed,3),'errors':errors,'timeouts':timeouts,
            'error_rate':round(sum(errors.values())/max(1,count),6),'resources':metrics(before,after,elapsed),
            'raw_latency_seconds':{role:[round(v,6) for v in values] for role,values in samples.items()}}


def accepted(row):
    cold=row['cold_latency_seconds'];warm=row['warm']
    return (cold['p95']<=THRESHOLDS['cold_p95_seconds'] and cold['p99']<=THRESHOLDS['cold_p99_seconds']
            and all(v['p95'] is not None and v['p95']<=THRESHOLDS['warm_p95_seconds']
                    and v['p99']<=THRESHOLDS['warm_p99_seconds'] for v in warm['latency_seconds'].values())
            and sum(warm['errors'].values())==THRESHOLDS['errors'] and not warm['timeouts']
            and warm['throughput_rps']>=THRESHOLDS['throughput_rps']
            and warm['resources']['memory_peak_since_start_mib']<=THRESHOLDS['edge_memory_peak_mib']
            and not warm['resources']['oom_kills'])


def run_suite(request,command,authorization,wait_ready,output,configured_cpu,duration=60,soak=180,selected_only=False):
    report={'thresholds':THRESHOLDS,'conditions':{'server_cpuset':'0,1','cold_samples_per_candidate':5,
            'bcrypt_cost':14,'policy':'Unmodified reviewer Basic Auth and pinned Caddy; internal test TLS',
            'scope':'Transport experiment with synthetic HTTP upstreams; actual application test is separate',
            'memory':'128 MiB edge cap; no swap; peak includes startup; host/client/daemon outside server cpuset'},
            'candidates':[],'configured_cpu':configured_cpu}
    from runtime_regression import run
    report['source_sha']=run('git','rev-parse','HEAD').stdout.strip()
    report['working_tree_dirty']=bool(run('git','status','--porcelain').stdout.strip())
    report['engine']=json.loads(run('docker','info','--format',
        '{"architecture":{{json .Architecture}},"cpus":{{.NCPU}},"memory_bytes":{{.MemTotal}},"cgroup_driver":{{json .CgroupDriver}},"cgroup_version":{{json .CgroupVersion}}}').stdout)
    report['caddy_version']=command('exec','-T','edge','caddy','version').stdout.strip()
    container=command('ps','--quiet','edge').stdout.strip()
    report['edge_cpu_shares']=int(run('docker','inspect','--format','{{.HostConfig.CpuShares}}',container).stdout.strip())
    report['conditions']['contention']='two 0.4-CPU competitors, 1920 shares each, pinned to the same two CPUs'
    def save():output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(report,indent=2)+'\n')
    for cpu in ((configured_cpu,) if selected_only else CANDIDATES):
        command('stop','burn-a','burn-b')
        # Update the existing owned container rather than rebuilding software between candidates.
        container=command('ps','--all','--quiet','edge').stdout.strip()
        run('docker','update','--cpus',str(cpu),container)
        cold=[];cold_resources=[];controls=[]
        for _ in range(5):
            command('restart','edge');wait_ready('edge')
            before=cgroup(command);start=time.monotonic()
            assert request(auth=authorization)[0]==200
            elapsed=time.monotonic()-start;cold.append(elapsed)
            cold_resources.append(metrics(before,cgroup(command),elapsed))
            start=time.monotonic();assert request('university.example.invalid')[0]==200
            controls.append(time.monotonic()-start)
        row={'cpus':cpu,'cold_latency_seconds':distribution(cold),'cold_raw_seconds':cold,
             'cold_resources':cold_resources,'tls_backend_control_seconds':distribution(controls),
             'warm':load(request,command,authorization,duration)}
        row['accepted']=accepted(row);report['candidates'].append(row);save()
        print(json.dumps({'candidate_cpu':cpu,'cold':row['cold_latency_seconds'],
              'warm':row['warm']['latency_seconds'],'rps':row['warm']['throughput_rps'],
              'resources':row['warm']['resources'],'accepted':row['accepted']}),flush=True)
    passing=[r['cpus'] for r in report['candidates'] if r['accepted']]
    report['lowest_passing_cpu']=min(passing) if passing else None
    if configured_cpu not in passing:
        save();raise AssertionError('Configured edge CPU does not meet the predefined transport thresholds')
    container=command('ps','--all','--quiet','edge').stdout.strip()
    run('docker','update','--cpus',str(configured_cpu),container)
    command('up','--pull','never','--no-build','-d','burn-a','burn-b')
    cold=[];cold_resources=[]
    for _ in range(5):
        command('restart','edge');wait_ready('edge')
        def first_request():
            start=time.monotonic();assert request(auth=authorization)[0]==200
            return time.monotonic()-start
        before=cgroup(command);start=time.monotonic()
        with ThreadPoolExecutor(max_workers=2) as pool:
            cold.extend(pool.map(lambda _:first_request(),range(2)))
        cold_resources.append(metrics(before,cgroup(command),time.monotonic()-start))
    report['contention_cold']={'concurrency':2,'raw_seconds':cold,'latency_seconds':distribution(cold),'resources':cold_resources}
    print(json.dumps({'contention_cold':report['contention_cold']}),flush=True)
    save()
    report['contention']=load(request,command,authorization,duration)
    command('stop','burn-a','burn-b')
    report['soak']=load(request,command,authorization,soak)
    for phase in ('contention','soak'):
        check={'cold_latency_seconds':{'p95':0,'p99':0},'warm':report[phase]}
        report[phase]['accepted']=accepted(check)
    report['accepted']=all(report[p]['accepted'] for p in ('contention','soak')) and distribution(cold)['p95']<=THRESHOLDS['cold_p95_seconds'] and distribution(cold)['p99']<=THRESHOLDS['cold_p99_seconds']
    save()
    assert report['accepted'],'Selected configuration failed contention/soak thresholds'
    # Include one same-user wrong password, not just an unknown username, after the load.
    import base64
    wrong='Basic '+base64.b64encode(b'reviewer:not-the-password').decode()
    assert request(auth=wrong)[0]==401 and request()[0]==401
    assert request('university.example.invalid',host_header='review.example.invalid')[0]==421
    report['negative_auth_and_sni']='passed';report['result']='passed';save()
    return report
