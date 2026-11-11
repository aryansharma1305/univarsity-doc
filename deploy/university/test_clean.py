import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('university_clean',Path(__file__).with_name('clean.py'))
clean=importlib.util.module_from_spec(spec);spec.loader.exec_module(clean)

def manifest():
    return {'commit':'a'*40,'architecture':'linux/amd64','images':{role:{'id':'sha256:'+str(index)*64}for index,role in enumerate(clean.ROLES,1)}}

class CleanPreparation(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.directory=Path(self.temp.name).resolve()/'university'

    def test_preparation_is_offline_and_has_no_seed_or_staging_fixtures(self):
        with patch('subprocess.run',side_effect=AssertionError('No Docker/VPS actions permitted')):
            record=clean.prepare(self.directory,'https://university.example.invalid',manifest())
        self.assertRegex(record['project'],r'^docversity-university-[a-f0-9]{8}$')
        self.assertFalse(record['realDataAuthorized']);self.assertFalse(record['publicCutoverAuthorized'])
        self.assertEqual(self.directory.stat().st_mode&0o777,0o700)
        text=''.join(p.read_text()for p in (self.directory/'secrets').iterdir())
        self.assertNotIn('S3_TEST_BUCKET',text);self.assertNotIn('STAGING-',text)
        self.assertNotIn('ADMIN_PASSWORD',text);self.assertNotIn('reviewers.json',text)
        self.assertIn('WEB_URL=https://localhost:3553',text);self.assertIn('COOKIE_SECURE=true',text)
        self.assertIn('user default off',text);self.assertIn('~university:*',text)
        for file in (self.directory/'secrets').iterdir():self.assertEqual(file.stat().st_mode&0o777,0o444)

    def test_only_private_caddy_publishes_and_all_state_is_separate(self):
        clean.prepare(self.directory,'https://university.example.invalid',manifest())
        config=json.loads((self.directory/'compose.json').read_text())
        for name,service in config['services'].items():
            self.assertNotIn('network_mode',service)
            self.assertEqual(service['security_opt'],['no-new-privileges:true'])
            if name=='proxy':self.assertEqual(service['ports'],['127.0.0.1:3553:443'])
            else:self.assertNotIn('ports',service)
            self.assertNotIn('build',service)
            if service['image'].startswith('sha256:'):self.assertEqual(service['pull_policy'],'never')
        self.assertTrue(config['networks']['backend']['internal'])
        self.assertFalse(any(volume.get('external',False)for volume in config['volumes'].values()))
        self.assertNotIn('tools',config['services'])
        text=(self.directory/'compose.json').read_text()
        self.assertNotIn('.local/staging',text);self.assertNotIn('docversity14h',text)
        self.assertNotIn('fixture',text);self.assertIn('docversity_university',text)
        self.assertTrue(all('@sha256:'in pin for pin in clean.PINS.values()))

    def test_credentials_are_fresh_and_instances_never_overwrite(self):
        clean.prepare(self.directory,'https://university.example.invalid',manifest())
        other=self.directory.parent/'other';clean.prepare(other,'https://university.example.invalid',manifest())
        for name in ('database_app_password','database_owner_password','redis_password','runtime','minio'):
            self.assertNotEqual((self.directory/'secrets'/name).read_text(),(other/'secrets'/name).read_text())
        before=(self.directory/'secrets/runtime').read_bytes()
        with self.assertRaises(ValueError):clean.prepare(self.directory,'https://university.example.invalid',manifest())
        self.assertEqual((self.directory/'secrets/runtime').read_bytes(),before)

    def test_rejects_incomplete_mutable_or_wrong_architecture_image_sets(self):
        for change in ({'architecture':'linux/arm64'},{'commit':'main'},{'images':{'api':{'id':'api:latest'}}}):
            with self.assertRaises(ValueError):clean.image_ids({**manifest(),**change})
        for origin in ('http://example.invalid','https://example.invalid/path','https://user:pass@example.invalid','https://example.invalid:443','https://example.invalid\n'):
            with self.assertRaises(ValueError):clean.validate_origin(origin)

    def test_public_candidate_does_not_mutate_private_configuration_or_execute(self):
        clean.prepare(self.directory,'https://university.example.invalid',manifest())
        before=(self.directory/'compose.json').read_bytes()
        with patch('subprocess.run',side_effect=AssertionError('No deployment permitted')):
            target=clean.prepare_public(self.directory,'operator@example.invalid')
        config=json.loads((target/'compose.json').read_text())
        self.assertEqual(config['services']['proxy']['ports'],['80:80','443:443'])
        self.assertNotIn('tls internal',(target/'Caddyfile').read_text())
        self.assertIn('CORS_ORIGINS=https://university.example.invalid',(target/'runtime').read_text())
        self.assertEqual((self.directory/'compose.json').read_bytes(),before)
        with self.assertRaises(ValueError):clean.prepare_public(self.directory,'operator@example.invalid')

    def test_uncommitted_or_wrong_source_release_is_refused(self):
        clean.prepare(self.directory,'https://university.example.invalid',manifest())
        with patch('subprocess.check_output',side_effect=['a'*40+'\n',' M source.ts\n']):
            with self.assertRaises(ValueError):clean.validate_release(self.directory,'a'*40)
        with patch('subprocess.check_output',side_effect=['b'*40+'\n','']):
            with self.assertRaises(ValueError):clean.validate_release(self.directory,'a'*40)
        with patch('subprocess.check_output',side_effect=['a'*40+'\n','']):
            clean.validate_release(self.directory,'a'*40)

    def test_plan_is_explicit_private_and_contains_empty_database_checks(self):
        clean.prepare(self.directory,'https://university.example.invalid',manifest())
        commands=clean.plan(self.directory)
        text=json.dumps(commands)
        self.assertIn('check-empty',text);self.assertIn('create-admin.js',text)
        self.assertIn('--after-bootstrap',text)
        for bad in ('ssh','seed','fixtures','down','prune','volume rm','--build','--force-recreate','docversity14h'):
            self.assertNotIn(bad,text)

if __name__=='__main__':unittest.main()
