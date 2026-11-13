"""Synthetic offline regressions. No Docker daemon, network, database or account required."""
import copy
import importlib.util
import json
import os
import shutil
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'deploy/scripts'))
import staging

spec = importlib.util.spec_from_file_location('coexist_prepare', Path(__file__).with_name('prepare.py'))
edge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(edge)
clean = edge.clean
MANIFEST = {'commit':'a'*40,'architecture':'linux/amd64',
            'images':{role:{'id':'sha256:'+str(i)*64} for i,role in enumerate(clean.ROLES,1)}}
VALID_GATE = '(reviewer_gate) {\n\tbasic_auth @gated {\n\t\treviewer $2a$14$'+'A'*53+'\n\t}\n}\n'


class SharedEdgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.uni = self.root/'university'
        self.state = self.root/'staging'
        self.bundle = self.root/'edge'
        self.state.mkdir(mode=0o700)
        self.instance = {'project':'docversity14h','public':True,'origin':'https://review.example.invalid'}
        (self.state/'instance.json').write_text(json.dumps(self.instance))
        self.gate = self.state/'review_gate.caddy'
        self.gate.write_text(VALID_GATE)
        self.gate.chmod(0o444)
        clean.prepare(self.uni, 'https://university.example.invalid', MANIFEST, shared_proxy=True)

    def prepare(self):
        with patch('subprocess.run', side_effect=AssertionError('No external process permitted')):
            return edge.prepare(self.bundle, self.uni, self.state, self.instance['origin'], 'ops@example.invalid')

    def adopt(self):
        self.record = self.prepare()
        marker = self.state/'shared-edge.json'
        marker.write_bytes((self.bundle/'shared-edge.json').read_bytes())
        marker.chmod(0o444)
        for name, value in [('SECRETS',self.state),('GATE',self.gate),('PROJECT','docversity14h'),
                            ('INSTANCE',{**self.instance,'sharedProxy':True}),('OVERLAYS',['compose.review.yml','compose.public.yml'])]:
            patcher = patch.object(staging, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_university_has_no_proxy_ports_or_shared_backend(self):
        config=json.loads((self.uni/'compose.json').read_text())
        record=json.loads((self.uni/'instance.json').read_text())
        self.assertNotIn('proxy',config['services'])
        self.assertNotIn('web',config['services'])
        self.assertRegex(record['webService'],r'^uniweb-[a-f0-9]{8}$')
        self.assertIsNone(record['privateLocalOrigin'])
        self.assertTrue(config['networks']['edge']['internal'])
        self.assertTrue(config['networks']['backend']['internal'])
        self.assertFalse(any(v.get('external') for v in config['volumes'].values()))
        for name, service in config['services'].items():
            self.assertNotIn('ports',service)
            self.assertNotIn('network_mode',service)
            self.assertEqual(service['mem_limit'],service['memswap_limit'])
            if name!=record['webService']:
                self.assertEqual(service['networks'],['backend'])
        runtime=(self.uni/'secrets/runtime').read_text()
        self.assertIn('WEB_URL=https://university.example.invalid\n',runtime)
        self.assertIn('TRUST_PROXY=2',runtime)
        self.assertIn('COOKIE_SECURE=true',runtime)
        self.assertNotIn('create-admin',json.dumps(clean.plan(self.uni)))
        bootstrap=config['services']['staff-bootstrap']
        self.assertEqual(bootstrap['profiles'],['operator'])
        self.assertEqual(bootstrap['mem_limit'],'512m')
        self.assertEqual(bootstrap['healthcheck'],{'disable':True})
        with self.assertRaisesRegex(ValueError,'second public proxy'):
            clean.prepare_public(self.uni,'ops@example.invalid')

    def test_only_edge_publishes_and_preserves_original_certificates_and_gate(self):
        before=self.gate.read_bytes()
        record=self.prepare()
        self.assertEqual(self.bundle.stat().st_mode&0o777,0o700)
        self.assertEqual((self.bundle/'config').stat().st_mode&0o777,0o755)
        config=json.loads((self.bundle/'compose.json').read_text())
        self.assertEqual(list(config['services']),['proxy'])
        proxy=config['services']['proxy']
        self.assertEqual(proxy['ports'],['80:80','443:443'])
        self.assertNotIn('depends_on',proxy)
        self.assertEqual(config['secrets']['reviewer_gate']['file'],str(self.gate))
        self.assertEqual(self.gate.read_bytes(),before)
        self.assertEqual(config['volumes']['caddy'],{'external':True,'name':'docversity14h_caddy'})
        self.assertEqual(config['volumes']['caddy_config']['name'],'docversity14h_caddy_config')
        self.assertFalse(any('university' in n and 'backend' in n for n in config['networks']))
        self.assertEqual(record['liveChangesAuthorized'],False)
        self.assertNotIn('SESSION_SECRET',json.dumps(config))
        self.assertNotIn('runtime',json.dumps(config['secrets']))
        with self.assertRaises(ValueError):self.prepare()

    def test_distinct_hosts_and_unchanged_staging_authentication_before_upstreams(self):
        self.prepare()
        text=(self.bundle/'config/Caddyfile').read_text()
        self.assertIn('admin off',text)
        self.assertIn('strict_sni_host on',text)
        self.assertIn('https://review.example.invalid'.removeprefix('https://')+' {',text)
        self.assertIn('university.example.invalid {',text)
        self.assertEqual((self.bundle/'config/review-site.caddy').read_bytes(),(ROOT/'deploy/review-site.caddy').read_bytes())
        review=(self.bundle/'config/review-site.caddy').read_text()
        self.assertLess(review.index('import reviewer_gate'),review.index('reverse_proxy'))
        self.assertIn('@gated not path /robots.txt',review)
        self.assertIn('header_up X-Forwarded-For {client_ip}',text)
        self.assertNotIn('reverse_proxy web:3000',text)
        for origin, service in [('https://review.example.invalid','uniweb-12345678'),
                                ('https://other.example.invalid','web'),
                                ('http://other.example.invalid','uniweb-12345678')]:
            with self.assertRaises(ValueError):
                edge.caddyfile(self.instance['origin'],origin,service,'ops@example.invalid')

    def test_no_shared_secrets_aliases_or_volumes_between_university_instances(self):
        other=self.root/'other'
        second=clean.prepare(other,'https://second.example.invalid',MANIFEST,shared_proxy=True)
        first=json.loads((self.uni/'instance.json').read_text())
        self.assertNotEqual(first['project'],second['project'])
        self.assertNotEqual(first['frontendNetwork'],second['frontendNetwork'])
        self.assertNotEqual(first['webService'],second['webService'])
        for name in ('database_bootstrap_password','database_owner_password','database_app_password',
                     'redis_password','runtime','worker_runtime','migration_runtime','minio'):
            self.assertNotEqual((self.uni/'secrets'/name).read_bytes(),(other/'secrets'/name).read_bytes())
        self.assertNotIn('SESSION_SECRET',(self.uni/'secrets/worker_runtime').read_text())
        self.assertNotIn('DATABASE_URL',(self.uni/'secrets/web_runtime').read_text())
        self.assertNotIn('docversity14h',(self.uni/'compose.json').read_text())

    def test_rejects_malformed_writable_or_missing_gate(self):
        for value in ('','(reviewer_gate) {}',VALID_GATE.replace('$2a$14$'+'A'*53,'plaintext')):
            self.gate.chmod(0o600);self.gate.write_text(value);self.gate.chmod(0o444)
            with self.assertRaises(ValueError):self.prepare()
        self.gate.chmod(0o600);self.gate.write_text(VALID_GATE)
        with self.assertRaises(ValueError):self.prepare()

    def test_new_private_state_is_refused_inside_another_git_checkout(self):
        checkout=self.root/'another-checkout'
        checkout.mkdir()
        (checkout/'.git').write_text('gitdir: synthetic-worktree')
        directory=checkout/'private'
        with self.assertRaises(ValueError):
            clean.prepare(directory,'https://university.example.invalid',MANIFEST,shared_proxy=True)
        with self.assertRaises(ValueError):
            edge.prepare(directory,self.uni,self.state,self.instance['origin'],'ops@example.invalid')
        self.assertFalse(directory.exists())
        self.gate.unlink()
        with self.assertRaises(ValueError):self.prepare()

    def test_refuses_cross_network_and_public_university_configurations(self):
        original=json.loads((self.uni/'compose.json').read_text())
        for mutation in ('ports','network','project','backend','volume'):
            config=copy.deepcopy(original)
            if mutation=='ports':config['services']['postgres']['ports']=['5432:5432']
            elif mutation=='network':config['services']['api']['networks'].append('edge')
            elif mutation=='project':config['name']='docversity14h'
            elif mutation=='backend':config['networks']['backend']={'external':True,'name':'docversity14h_backend'}
            else:config['volumes']['postgres']={'external':True,'name':'docversity14h_postgres'}
            (self.uni/'compose.json').write_text(json.dumps(config))
            with self.assertRaises(ValueError):self.prepare()

    def test_resource_budget_and_no_unbounded_swap(self):
        steady=sum(m for m,c in edge.STAGING_LIMITS.values())+sum(m for m,c in clean.UNIVERSITY_LIMITS.values())+128
        cpu=sum(c for m,c in edge.STAGING_LIMITS.values())+sum(c for m,c in clean.UNIVERSITY_LIMITS.values())+edge.EDGE_CPUS
        self.assertEqual(steady,5696)
        self.assertLessEqual(cpu,1.81)
        paused_stage_writers=sum(edge.STAGING_LIMITS[s][1] for s in ('api','worker','web'))
        self.assertLessEqual(cpu-paused_stage_writers+edge.OPERATOR_CPUS,1.81)
        self.assertEqual(edge.EDGE_CPUS,1.0)
        self.assertGreater(edge.EDGE_CPU_SHARES,6*512+6*128)
        self.assertLess(steady+1536+512,7.8*1024)

    def test_container_startup_refuses_invalid_gate_before_caddy_exec(self):
        binary=self.root/'bin'
        binary.mkdir()
        sentinel=self.root/'caddy-executed'
        (binary/'caddy').write_text('#!/bin/sh\nprintf started > "$START_SENTINEL"\n')
        (binary/'caddy').chmod(0o700)
        environment={**os.environ,'PATH':str(binary)+':'+os.environ['PATH'],'START_SENTINEL':str(sentinel)}
        variants=[VALID_GATE,'','(reviewer_gate) {\n}\n',VALID_GATE+'\n',
                  VALID_GATE.replace('reviewer $','reviewer extra $'),
                  VALID_GATE.replace('reviewer $','!!!reviewer $')]
        for index,content in enumerate(variants):
            self.gate.chmod(0o600);self.gate.write_text(content);self.gate.chmod(0o444)
            sentinel.unlink(missing_ok=True)
            result=subprocess.run(['/bin/sh',str(ROOT/'deploy/coexist/start.sh'),str(self.gate)],env=environment,capture_output=True)
            self.assertEqual(result.returncode==0,index==0)
            self.assertEqual(sentinel.exists(),index==0)
        self.gate.chmod(0o600);self.gate.write_text(VALID_GATE)
        sentinel.unlink(missing_ok=True)
        result=subprocess.run(['/bin/sh',str(ROOT/'deploy/coexist/start.sh'),str(self.gate)],env=environment,capture_output=True)
        self.assertNotEqual(result.returncode,0)
        self.assertFalse(sentinel.exists())

    def test_stage_start_stop_and_gate_failure_never_touch_shared_proxy(self):
        self.adopt()
        with patch.object(staging,'require_gate'), patch.object(staging,'preflight'), patch.object(staging,'verify_gate'), patch.object(staging,'compose') as command:
            staging.up();staging.stop()
            self.assertEqual(command.call_args_list[0].args,('up','--no-build','-d','--wait',*staging.application_services()))
            self.assertEqual(command.call_args_list[1].args,('stop',*staging.application_services()))
        calls=[]
        def fail(*args,**kwargs):
            calls.append(args)
            if args[0]=='run':raise subprocess.CalledProcessError(1,'synthetic gate failure')
        with patch.object(staging,'compose',side_effect=fail):
            with self.assertRaisesRegex(SystemExit,'shared edge untouched'):staging.verify_gate()
        self.assertEqual(calls[-1],('stop','web','api'))

    def test_initial_handoff_and_rollback_only_reconcile_the_old_proxy(self):
        with patch.object(staging,'shared_edge',return_value=None),patch.object(staging,'INSTANCE',self.instance),patch.object(staging,'require_gate'),patch.object(staging,'verify_gate') as verify,patch.object(staging,'compose') as command:
            staging.proxy_handoff()
            staging.proxy_handoff(resume=True)
            self.assertEqual(command.call_args_list[0].args,('stop','proxy'))
            self.assertEqual(command.call_args_list[1].args,('up','--no-build','--no-deps','-d','--wait','proxy'))
            verify.assert_called_once()
        self.adopt()
        with patch.object(staging,'compose') as command:
            with self.assertRaises(SystemExit):staging.proxy_handoff()
        command.assert_not_called()

    def test_stage_backup_quiesces_only_staging_and_still_refuses_queued_work(self):
        self.adopt()
        calls=[]
        def refuse(*args,**kwargs):
            calls.append(args)
            if args[0]=='run':raise subprocess.CalledProcessError(1,'synthetic pending import')
        with patch.object(staging,'BACKUPS',self.root/'backups'),patch.object(staging,'require_gate'),patch.object(staging,'require_stopped_worker'),patch.object(staging,'up') as restart,patch.object(staging,'compose',side_effect=refuse):
            with self.assertRaises(subprocess.CalledProcessError):staging.backup()
        self.assertEqual(calls[0],('stop','web','api'))
        self.assertFalse(any('proxy' in call for call in calls))
        self.assertFalse(any(call[0]=='exec' for call in calls))
        restart.assert_called_once()

    def test_recovery_compose_never_inherits_public_or_shared_edge_settings(self):
        self.adopt()
        active=staging.compose_files('docversity14h')
        recovery=staging.compose_files('docversity14h-restore')
        self.assertIn(str(self.bundle/'staging-overlay.json'),active)
        self.assertEqual(recovery,['-f',str(ROOT/'deploy/compose.yml')])

    def test_corrupt_adoption_metadata_fails_closed_instead_of_stopping_the_proxy(self):
        self.adopt()
        path=self.bundle/'config/Caddyfile'
        path.chmod(0o600);path.write_text('tampered');path.chmod(0o444)
        with patch.object(staging,'compose') as command:
            with self.assertRaisesRegex(SystemExit,'record invalid'):staging.stop()
        command.assert_not_called()

    def test_missing_marker_target_and_wrong_environment_are_refused(self):
        self.adopt()
        path=self.state/'shared-edge.json'
        for change in ({'stagingProject':'docversity14b'},{'edgeProject':'other'},{'files':{}}):
            path.chmod(0o600);path.write_text(json.dumps({**self.record,**change}));path.chmod(0o444)
            with self.assertRaises(SystemExit):staging.shared_edge()
        path.unlink()
        with patch.object(staging,'compose') as command:
            with self.assertRaisesRegex(SystemExit,'record missing'):staging.stop()
        command.assert_not_called()

    @unittest.skipUnless(os.environ.get('COMPOSE_BIN') or (os.environ.get('CI')=='true' and shutil.which('docker')),
                         'Native Compose parser not supplied; no Docker daemon is used')
    def test_real_compose_parser_accepts_private_university_edge_and_retired_stage_proxy(self):
        self.prepare()
        checkout=self.root/'checkout'
        (checkout/'deploy').mkdir(parents=True)
        for name in ('compose.yml','compose.review.yml','compose.public.yml'):
            shutil.copy2(ROOT/'deploy'/name,checkout/'deploy'/name)
        environment={**os.environ,'PUBLIC_DOMAIN':'review.example.invalid','ACME_EMAIL':'ops@example.invalid',
                     'STAGING_PROJECT':'docversity14h','IMAGE_TAG':'a'*40,
                     'DOCKER_HOST':'unix://'+str(self.root/'forbidden-docker.sock')}
        for files in ([self.uni/'compose.json'],[self.bundle/'compose.json'],
                      [checkout/'deploy'/n for n in ('compose.yml','compose.review.yml','compose.public.yml')]+[self.bundle/'staging-overlay.json']):
            command=([environment['COMPOSE_BIN']] if environment.get('COMPOSE_BIN') else ['docker','compose'])
            command+=['--project-name','synthetic-check']
            command.extend(arg for path in files for arg in ('-f',str(path)))
            result=subprocess.run(command+['config','--quiet'],env=environment,capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)


if __name__=='__main__':unittest.main()
