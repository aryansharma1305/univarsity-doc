import hashlib
import io
import json
import tarfile
from pathlib import Path
import runpy
import tempfile
import shutil
import subprocess
import sys
import unittest
from unittest.mock import patch
import staging

REHEARSAL = runpy.run_path(str(Path(__file__).with_name('rehearse-release.py')))


class ReleaseMigrationTests(unittest.TestCase):
    def test_rehearsal_accepts_the_exact_candidate_at_any_migration_count(self):
        for count in (21, 22, 30):
            with self.subTest(count=count), tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                migrations = root / REHEARSAL['MIGRATIONS']
                names = [f'20261112{index:06d}_synthetic' for index in range(count)]
                for name in names:
                    directory = migrations / name
                    directory.mkdir(parents=True)
                    (directory / 'migration.sql').write_text('SELECT 1;\n')
                (migrations / 'migration_lock.toml').write_text('provider = "postgresql"\n')
                subprocess.run(['git', 'init', '-q', folder], check=True)
                subprocess.run(['git', '-C', folder, 'add', '.'], check=True)
                tree = subprocess.check_output(['git', '-C', folder, 'write-tree'], text=True).strip()
                untracked = migrations / 'untracked'
                untracked.mkdir()
                (untracked / 'migration.sql').write_text('SELECT 2;\n')

                with patch.object(staging, 'ROOT', root):
                    expected = REHEARSAL['candidate_migrations'](tree)
                self.assertEqual(expected, names)
                REHEARSAL['require_complete_migrations'](
                    expected, [[name, True, False, False] for name in reversed(names)],
                )

    def test_rehearsal_refuses_missing_extra_substituted_or_duplicate_names(self):
        expected = ['first', 'second']
        for names in (['first'], ['first', 'second', 'extra'], ['first', 'extra'], ['first', 'second', 'second']):
            with self.subTest(names=names), self.assertRaisesRegex(SystemExit, 'must exactly match'):
                REHEARSAL['require_complete_migrations'](
                    expected, [[name, True, False, False] for name in names],
                )

    def test_rehearsal_refuses_failed_rolled_back_and_unfinished_history(self):
        applied = ['second', True, False, False]
        for row in (
            ['second', False, False, True],
            ['second', True, False, True],
            ['second', False, True, False],
            ['second', False, False, False],
        ):
            with self.subTest(row=row), self.assertRaisesRegex(SystemExit, 'Failed, rolled-back or unfinished'):
                REHEARSAL['require_complete_migrations'](
                    ['first', 'second'], [['first', True, False, False], applied, row],
                )


class ReleaseArchiveTests(unittest.TestCase):
    def fixture(self, identity='index', config=None, config_size_delta=0, manifest_size_delta=0, platform='amd64'):
        config = config or b'{"architecture":"amd64","os":"linux"}'
        files = {}

        def blob(content):
            digest = 'sha256:' + hashlib.sha256(content).hexdigest()
            files['blobs/' + digest.replace(':', '/')] = content
            return {'digest': digest, 'size': len(content)}

        self.config = blob(config)
        self.config['size'] += config_size_delta
        self.manifest = blob(json.dumps({'schemaVersion': 2, 'config': self.config, 'layers': []}).encode())
        self.manifest['size'] += manifest_size_delta
        self.index = blob(json.dumps({'schemaVersion': 2, 'manifests': [
            {**self.manifest, 'platform': {'os': 'linux', 'architecture': platform}},
        ]}).encode())
        reference = 'docversity14a-api:' + 'a' * 40
        images = {'api': {'reference': reference, 'id': getattr(self, identity)['digest'],
                          'os': 'linux', 'architecture': 'amd64'}}
        self.entry = {'Config': 'blobs/' + self.config['digest'].replace(':', '/'),
                      'RepoTags': [reference], 'Layers': []}
        self.files = files
        self.images = images
        return images

    def verify(self, duplicate_tag=False):
        with tempfile.TemporaryDirectory() as folder:
            archive = Path(folder) / 'images.tar.gz'
            files = {**self.files, 'manifest.json': json.dumps([self.entry] * (2 if duplicate_tag else 1)).encode()}
            with tarfile.open(archive, 'w:gz') as bundle:
                for name, content in files.items():
                    member = tarfile.TarInfo(name)
                    member.size = len(content)
                    bundle.addfile(member, io.BytesIO(content))
            return REHEARSAL['verify_image_archive'](archive, self.images)

    def test_accepts_classic_config_and_containerd_manifest_and_index_ids(self):
        for identity in ('config', 'manifest', 'index'):
            with self.subTest(identity=identity):
                self.fixture(identity)
                self.verify()

    def test_reads_complete_configs_larger_than_one_megabyte(self):
        self.fixture('config', b'{"padding":"' + b'x' * (1024 * 1024 + 10) + b'"}')
        self.verify()

    def test_refuses_a_hash_of_only_the_config_prefix(self):
        config = b'{"padding":"' + b'x' * (1024 * 1024 + 10) + b'"}'
        self.fixture('config', config)
        self.images['api']['id'] = 'sha256:' + hashlib.sha256(config[:1024 * 1024]).hexdigest()
        with self.assertRaises(SystemExit):
            self.verify()

    def test_refuses_changed_config_bytes_even_with_the_expected_filename(self):
        self.fixture()
        self.files[self.entry['Config']] += b' '
        with self.assertRaises(SystemExit):
            self.verify()

    def test_refuses_another_images_valid_config_under_the_expected_tag(self):
        self.fixture()
        content = b'{"other":"image"}'
        path = 'blobs/sha256/' + hashlib.sha256(content).hexdigest()
        self.files[path] = content
        self.entry['Config'] = path
        with self.assertRaises(SystemExit):
            self.verify()

    def test_refuses_modified_or_missing_identity_chain_blobs(self):
        for identity in ('manifest', 'index'):
            for replacement in (None, b'{}'):
                with self.subTest(identity=identity, replacement=replacement):
                    self.fixture()
                    path = 'blobs/' + getattr(self, identity)['digest'].replace(':', '/')
                    if replacement is None:
                        del self.files[path]
                    else:
                        self.files[path] = replacement
                    with self.assertRaises(SystemExit):
                        self.verify()

    def test_refuses_wrong_descriptor_sizes_and_platform(self):
        for options in ({'config_size_delta': 1}, {'manifest_size_delta': 1}, {'platform': 'arm64'}):
            with self.subTest(options=options):
                self.fixture(**options)
                with self.assertRaises(SystemExit):
                    self.verify()

    def test_accepts_classic_layout_without_oci_blobs(self):
        self.fixture('config')
        content = self.files[self.entry['Config']]
        self.entry['Config'] = self.config['digest'].removeprefix('sha256:') + '.json'
        self.files = {self.entry['Config']: content}
        self.verify()

    def test_refuses_duplicate_exported_tags(self):
        self.fixture()
        with self.assertRaisesRegex(SystemExit, 'exactly one exported image'):
            self.verify(duplicate_tag=True)

    def test_refuses_a_missing_config(self):
        self.fixture()
        del self.files[self.entry['Config']]
        with self.assertRaises(SystemExit):
            self.verify()

    def test_refuses_missing_exported_tags(self):
        self.fixture()
        self.entry['RepoTags'] = []
        with self.assertRaises(SystemExit):
            self.verify()


class RecoverySafetyTests(unittest.TestCase):
    def test_backup_requires_a_clean_worker_exit(self):
        for state in ['running 0 false', 'exited 137 false', 'exited 0 true']:
            with self.subTest(state=state), patch.object(staging, 'compose', return_value=subprocess.CompletedProcess([], 0, stdout='a' * 64)), patch.object(staging.subprocess, 'check_output', return_value=state):
                with self.assertRaisesRegex(SystemExit, 'did not shut down cleanly'):
                    staging.require_stopped_worker()
        with patch.object(staging, 'compose', return_value=subprocess.CompletedProcess([], 0, stdout='a' * 64)), patch.object(staging.subprocess, 'check_output', return_value='exited 0 false'):
            staging.require_stopped_worker()

    def test_backup_refuses_before_dump_and_restarts_after_readiness_failure(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(staging, 'BACKUPS', Path(folder)), patch.object(staging, 'require_gate'), patch.object(staging, 'require_stopped_worker'), patch.object(staging, 'up') as restart:
            calls = []
            def compose(*args, **kwargs):
                calls.append(args)
                if args[:2] == ('run', '--rm'):
                    raise subprocess.CalledProcessError(1, 'synthetic readiness refusal')
            with patch.object(staging, 'compose', side_effect=compose):
                with self.assertRaises(subprocess.CalledProcessError):
                    staging.backup()
            restart.assert_called_once()
            self.assertIn(('run', '--rm', '--no-deps', 'backup-readiness'), calls)
            self.assertFalse(any(call[0] == 'exec' for call in calls))
            self.assertFalse(list(Path(folder).rglob('database.dump')))
            self.assertFalse(list(Path(folder).rglob('manifest.json')))

    def test_vps_preflight_refuses_uninitialized_metadata_without_commands(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(staging, '_instance_file', Path(folder) / 'missing.json'), patch.object(staging, 'INSTANCE', {'public': True}), patch.object(staging.subprocess, 'run') as command:
            with self.assertRaisesRegex(SystemExit, 'initialized public review instance'):
                staging.preflight()
            command.assert_not_called()

    def test_public_start_requires_preflight_before_lifecycle(self):
        with patch.object(staging, 'INSTANCE', {'public': True}), patch.object(staging, 'require_gate'), patch.object(staging, 'preflight', side_effect=SystemExit('synthetic preflight failure')), patch.object(staging, 'compose') as compose:
            with self.assertRaisesRegex(SystemExit, 'synthetic preflight failure'):
                staging.up()
            compose.assert_not_called()

    def test_local_start_keeps_the_existing_path(self):
        with patch.object(staging, 'INSTANCE', {'public': False}), patch.object(staging, 'require_gate'), patch.object(staging, 'OVERLAYS', []), patch.object(staging, 'preflight') as preflight, patch.object(staging, 'compose') as compose:
            staging.up()
            preflight.assert_not_called()
            compose.assert_called_once_with('up', '--no-build', '-d', '--wait')

    def test_manifest_detects_changed_backup_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'database.dump').write_bytes(b'synthetic dump')
            before = staging.manifest(root)
            (root / 'manifest.json').write_text(json.dumps(before))
            self.assertEqual(staging.manifest(root), before)
            (root / 'database.dump').write_bytes(b'changed dump')
            self.assertNotEqual(staging.manifest(root), before)

    def test_restore_refuses_an_existing_target_before_starting_services(self):
        with tempfile.TemporaryDirectory() as folder:
            backup = Path(folder) / 'synthetic'
            backup.mkdir()
            (backup / 'database.dump').write_bytes(b'synthetic dump')
            (backup / 'manifest.json').write_text(json.dumps(staging.manifest(backup)))
            with patch.object(staging, 'BACKUPS', Path(folder)), patch.object(staging.subprocess, 'check_output', return_value=staging.RESTORE + '_postgres_data\n'), patch.object(staging, 'compose') as compose:
                with self.assertRaisesRegex(SystemExit, 'refusing to overwrite'):
                    staging.restore_test('synthetic')
                compose.assert_not_called()
            self.assertFalse((Path(folder) / 'backups').exists())

    def test_initializer_is_private_and_never_rotates_existing_secrets(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            scripts = root / 'deploy/scripts'
            scripts.mkdir(parents=True)
            script = scripts / 'init-local.py'
            shutil.copy2(Path(__file__).with_name('init-local.py'), script)
            subprocess.run([sys.executable, str(script)], check=True, capture_output=True)
            directory = root / '.local/staging'
            self.assertEqual(directory.stat().st_mode & 0o777, 0o700)
            self.assertNotIn('SESSION_SECRET', (directory / 'worker_runtime').read_text())
            self.assertNotEqual((directory / 'database_bootstrap_password').read_text(), (directory / 'database_owner_password').read_text())
            before = staging.manifest(directory)
            repeat = subprocess.run([sys.executable, str(script)], capture_output=True)
            self.assertNotEqual(repeat.returncode, 0)
            self.assertEqual(staging.manifest(directory), before)

    def run_initializer(self, root, *args):
        scripts = root / 'deploy/scripts'
        scripts.mkdir(parents=True, exist_ok=True)
        shutil.copy2(Path(__file__).with_name('init-local.py'), scripts / 'init-local.py')
        return subprocess.run([sys.executable, str(scripts / 'init-local.py'), *args], capture_output=True, text=True)

    def test_instance_options_are_validated_before_any_secret_is_written(self):
        for args in [['--project', 'docversity'], ['--project', 'prod'], ['--https-port', '443'], ['--public-origin', 'https://staging.example.org'], ['--public-origin', 'http://staging.example.org', '--acme-email', 'ops@example.org'], ['--public-origin', 'https://staging.example.org/path', '--acme-email', 'ops@example.org']]:
            with self.subTest(args=args), tempfile.TemporaryDirectory() as folder:
                result = self.run_initializer(Path(folder), *args)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse((Path(folder) / '.local/staging').exists())

    def test_review_instance_has_its_own_origin_and_least_privilege_reviewers(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            result = self.run_initializer(root, '--project', 'docversity14b', '--https-port', '3444')
            self.assertEqual(result.returncode, 0, result.stderr)
            directory = root / '.local/staging'
            instance = json.loads((directory / 'instance.json').read_text())
            self.assertEqual(instance, {'project': 'docversity14b', 'httpsPort': 3444, 'origin': 'https://localhost:3444', 'public': False, 'acmeEmail': None})
            self.assertIn('WEB_URL=https://localhost:3444', (directory / 'runtime').read_text())
            reviewers = json.loads((directory / 'reviewers.json').read_text())
            self.assertEqual([s['role'] for s in reviewers['staff']], ['SUPER_ADMIN', 'REGISTRAR', 'EXAM_ADMIN'])
            passwords = [reviewers['gate']['password'], reviewers['student']['password'], *(s['password'] for s in reviewers['staff'])]
            self.assertEqual(len(set(passwords)), 5)
            self.assertTrue(all(len(p) >= 32 for p in passwords))
            self.assertTrue(all(s['email'].endswith('@example.invalid') for s in reviewers['staff']))
            # Nothing secret is printed.
            for value in passwords:
                self.assertNotIn(value, result.stdout + result.stderr)

    VALID_GATE = '(reviewer_gate) {\n\tbasic_auth @gated {\n\t\treviewer $2a$14$' + 'A' * 53 + '\n\t}\n}\n'

    def gate_file(self, folder, content=None, mode=0o444):
        path = Path(folder) / 'review_gate.caddy'
        if content is not None:
            path.write_text(content)
            path.chmod(mode)
        return path

    def test_gate_validation_rejects_every_unsafe_gate_file(self):
        bad = {
            'missing': None,
            'empty': '',
            'unwrapped Phase 14B draft format': 'basic_auth @gated {\n\treviewer $2a$14$' + 'A' * 53 + '\n}\n',
            'wrong snippet name': self.VALID_GATE.replace('(reviewer_gate)', '(gate)'),
            'plaintext password': self.VALID_GATE.replace('$2a$14$' + 'A' * 53, 'hunter2'),
            'empty snippet': '(reviewer_gate) {\n}\n',
            'extra directive': self.VALID_GATE.replace('\t}\n}', '\t}\n\trespond 200\n}'),
            'second user': self.VALID_GATE.replace('\n\t}', '\n\t\tother $2a$14$' + 'B' * 53 + '\n\t}'),
        }
        for name, content in bad.items():
            with self.subTest(name), tempfile.TemporaryDirectory() as folder:
                with patch.object(staging, 'GATE', self.gate_file(folder, content)):
                    self.assertIsNotNone(staging.gate_problem())
        with tempfile.TemporaryDirectory() as folder:
            writable = self.gate_file(folder, self.VALID_GATE, 0o644)
            with patch.object(staging, 'GATE', writable):
                self.assertIn('writable', staging.gate_problem())
        with tempfile.TemporaryDirectory() as folder:
            (Path(folder) / 'review_gate.caddy').mkdir()
            with patch.object(staging, 'GATE', Path(folder) / 'review_gate.caddy'):
                self.assertEqual(staging.gate_problem(), 'not a regular file')
        with tempfile.TemporaryDirectory() as folder:
            real = self.gate_file(folder, self.VALID_GATE)
            link = Path(folder) / 'link.caddy'
            link.symlink_to(real)
            with patch.object(staging, 'GATE', link):
                self.assertEqual(staging.gate_problem(), 'missing')
            with patch.object(staging, 'GATE', real):
                self.assertIsNone(staging.gate_problem())

    def test_start_refuses_without_a_valid_gate_before_any_docker_action(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(staging, 'GATE', Path(folder) / 'review_gate.caddy'), patch.object(staging, 'BACKUPS', Path(folder) / 'backups'), patch.object(staging, 'OVERLAYS', ['compose.review.yml']), patch.object(staging, 'compose') as compose:
            for action in [staging.up, staging.backup]:
                with self.subTest(action=action.__name__), self.assertRaisesRegex(SystemExit, 'Reviewer gate missing; refusing to start'):
                    action()
            compose.assert_not_called()

    def test_review_and_public_instances_always_require_the_gate(self):
        self.assertTrue(staging.gate_required({'project': 'docversity14b'}))
        self.assertTrue(staging.gate_required({'project': 'docversity14a', 'public': True}))
        # Only Phase 14A's original loopback stack (and its CI job) may run without the gate.
        self.assertFalse(staging.gate_required({'project': 'docversity14a', 'public': False}))

    def test_failed_live_gate_check_stops_the_proxy(self):
        calls = []
        def compose(*args, **kwargs):
            calls.append(args)
            if args[:2] == ('run', '--rm'):
                raise subprocess.CalledProcessError(1, 'gate-check')
        with patch.object(staging, 'compose', side_effect=compose), patch.object(staging, 'INSTANCE', {'public': True}):
            with self.assertRaisesRegex(SystemExit, 'proxy stopped'):
                staging.verify_gate()
        self.assertEqual(calls[-1], ('stop', 'proxy'))

    def test_unlabelled_target_volume_is_also_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            backup = Path(folder) / 'synthetic'
            backup.mkdir()
            (backup / 'manifest.json').write_text('{}')
            def list_volumes(command, **kwargs):
                return '' if '--filter' in command else staging.RESTORE + '_minio\n'
            with patch.object(staging, 'BACKUPS', Path(folder)), patch.object(staging.subprocess, 'check_output', side_effect=list_volumes), patch.object(staging, 'compose') as compose:
                with self.assertRaisesRegex(SystemExit, 'refusing to overwrite'):
                    staging.restore_test('synthetic')
                compose.assert_not_called()

    def test_remote_docker_host_is_rejected_without_contacting_it(self):
        with patch.dict(staging.os.environ, {'DOCKER_HOST':'ssh://not-a-real-host.invalid', 'DOCKER_CONTEXT':''}), patch.object(staging.subprocess, 'check_output') as command:
            with self.assertRaisesRegex(SystemExit, 'remote contexts are refused'):
                staging.require_local_engine()
            command.assert_not_called()

    def test_selected_remote_context_is_rejected(self):
        with patch.dict(staging.os.environ, {'DOCKER_HOST':'', 'DOCKER_CONTEXT':'synthetic-context'}), patch.object(staging.subprocess, 'check_output', return_value='ssh://not-a-real-host.invalid'):
            with self.assertRaisesRegex(SystemExit, 'remote contexts are refused'):
                staging.require_local_engine()

    def test_restore_rejects_paths_before_any_docker_action(self):
        for name in [None, '../development', '/tmp/backup', '.hidden']:
            with self.subTest(name=name), patch.object(staging, 'compose') as compose:
                with self.assertRaises(SystemExit):
                    staging.restore_test(name)
                compose.assert_not_called()


if __name__ == '__main__':
    unittest.main()
