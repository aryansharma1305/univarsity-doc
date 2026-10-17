import json
from pathlib import Path
import tempfile
import shutil
import subprocess
import sys
import unittest
from unittest.mock import patch
import staging


class RecoverySafetyTests(unittest.TestCase):
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
