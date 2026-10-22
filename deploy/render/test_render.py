#!/usr/bin/env python3
"""Phase 14C render.py safety tests: private files, strict provider validation, no secret output,
fail-closed gate, refusal of live actions without authorization, and the review window."""
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch
import io
import json
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).parent))
import render  # noqa: E402

HASH = '$2a$14$' + 'A' * 53
VALID = {
    'EDGE_ORIGIN': 'https://docversity14c-edge.onrender.com',
    'EDGE_SERVICE_ID': 'srv-' + 'a1' * 10,
    'WEB_PRIVATE_HOSTPORT': 'docversity14c-web:3000',
    'API_PRIVATE_HOSTPORT': 'docversity14c-api:4000',
    'DATABASE_INTERNAL_HOST': 'dpg-' + 'b2' * 10 + '-a',
    'DATABASE_EXTERNAL_HOST': 'dpg-' + 'b2' * 10 + '-a.singapore-postgres.render.com',
    'DATABASE_ADMIN_USER': 'docversity_staging_user',
    'DATABASE_ADMIN_PASSWORD': 'Synthetic0Password0Only00',
    'REDIS_INTERNAL_URL': 'redis://red-' + 'c3' * 10 + ':6379',
    'R2_ENDPOINT': 'https://' + 'd4' * 16 + '.r2.cloudflarestorage.com',
    'R2_BUCKET': 'docversity14c-staging',
    'R2_ACCESS_KEY_ID': 'e5' * 16,
    'R2_SECRET_ACCESS_KEY': 'f6' * 32,
    'RENDER_TRUSTED_PROXIES': 'private_ranges',
    'RENDER_CLIENT_IP_HEADER': 'X-Forwarded-For',
}


class RenderToolTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        base = Path(self.folder.name) / '.local/render'
        self.patches = [patch.object(render, name, value) for name, value in {
            'DIRECTORY': base, 'SECRET_FILES': base / 'secret-files', 'OPERATOR': base / 'operator',
            'INSTANCE': base / 'instance.json', 'PROVIDER': base / 'provider.env', 'GATE': base / 'review_gate.caddy',
            'ROOT': Path(self.folder.name)}.items()]
        for p in self.patches:
            p.start()
        self.base = base

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.folder.cleanup()

    def quiet(self, function, *args):
        output = io.StringIO()
        with redirect_stdout(output):
            function(*args)
        return output.getvalue()

    def prepared(self, provider=VALID):
        self.quiet(render.init)
        render.GATE.write_text(f'(reviewer_gate) {{\n\tbasic_auth @gated {{\n\t\treviewer {HASH}\n\t}}\n}}\n')
        render.GATE.chmod(0o444)
        render.PROVIDER.chmod(0o600)
        render.PROVIDER.write_text('\n'.join(f'{k}={v}' for k, v in provider.items()) + '\n')

    def test_init_is_private_and_never_overwrites(self):
        output = self.quiet(render.init)
        self.assertEqual(self.base.stat().st_mode & 0o777, 0o700)
        generated = json.loads((self.base / 'generated.json').read_text())
        reviewers = json.loads((self.base / 'reviewers.json').read_text())
        self.assertEqual(len(set(generated.values())), 3)
        for value in [*generated.values(), reviewers['gate']['password']]:
            self.assertNotIn(value, output)
        before = (self.base / 'generated.json').read_text()
        with self.assertRaisesRegex(SystemExit, 'refusing to overwrite'):
            render.init()
        self.assertEqual((self.base / 'generated.json').read_text(), before)

    def test_assemble_refuses_without_a_valid_gate(self):
        self.prepared()
        render.GATE.chmod(0o644)
        render.GATE.write_text('(reviewer_gate) {\n}\n')
        render.GATE.chmod(0o444)
        with self.assertRaisesRegex(SystemExit, 'Reviewer gate'):
            render.assemble()
        self.assertFalse(render.SECRET_FILES.exists())

    def test_provider_values_are_strictly_validated_without_echoing_them(self):
        for key, bad in [('EDGE_ORIGIN', 'http://docversity14c-edge.onrender.com'), ('R2_BUCKET', 'docversity-local'),
                         ('DATABASE_EXTERNAL_HOST', 'dpg-' + 'z9' * 10 + '-a.singapore-postgres.render.com'),
                         ('RENDER_TRUSTED_PROXIES', '0.0.0.0/0 }'), ('RENDER_CLIENT_IP_HEADER', 'X-Client-IP'),
                         ('REDIS_INTERNAL_URL', 'rediss://red-' + 'c3' * 10 + '.singapore-redis.render.com:6379'),
                         ('DATABASE_ADMIN_PASSWORD', '')]:
            with self.subTest(key=key):
                self.tearDown(); self.setUp()
                self.prepared({**VALID, key: bad})
                with self.assertRaises(SystemExit) as refused:
                    render.assemble()
                if bad:
                    self.assertNotIn(bad, str(refused.exception))
                self.assertFalse(render.SECRET_FILES.exists())

    def test_assemble_writes_least_privilege_secret_files(self):
        self.prepared()
        output = self.quiet(render.assemble)
        read = lambda name: dict(l.split('=', 1) for l in (render.SECRET_FILES / name).read_text().splitlines())
        api, worker, web = read('api/runtime'), read('worker/runtime'), read('web/web_runtime')
        self.assertEqual(api['WEB_URL'], VALID['EDGE_ORIGIN'])
        self.assertEqual(api['CORS_ORIGINS'], VALID['EDGE_ORIGIN'])
        self.assertEqual((api['COOKIE_SECURE'], api['SWAGGER_ENABLED'], api['TRUST_PROXY']), ('true', 'false', '2'))
        self.assertTrue(api['DATABASE_URL'].startswith('postgresql://docversity_app:'))
        self.assertIn(VALID['DATABASE_INTERNAL_HOST'] + ':5432/docversity_staging', api['DATABASE_URL'])
        self.assertNotIn('SESSION_SECRET', worker)
        self.assertEqual(set(web), {'NODE_ENV', 'API_INTERNAL_URL', 'WEB_BEHIND_TRUSTED_PROXY'})
        self.assertEqual(web['API_INTERNAL_URL'], 'http://docversity14c-api:4000')
        self.assertIn('docversity_owner:', (render.OPERATOR / 'migration_runtime').read_text())
        self.assertIn('sslmode=verify-full', (render.OPERATOR / 'migration_runtime').read_text())
        self.assertEqual((render.SECRET_FILES / 'edge/review_gate.caddy').read_text(), render.GATE.read_text())
        for path in render.SECRET_FILES.rglob('*'):
            if path.is_file():
                self.assertEqual(path.stat().st_mode & 0o077, 0, path)
        for value in [VALID['DATABASE_ADMIN_PASSWORD'], VALID['R2_SECRET_ACCESS_KEY'], api['SESSION_SECRET']]:
            self.assertNotIn(value, output)

    def test_live_actions_refuse_without_authorization(self):
        self.prepared()
        for action in ['roles', 'migrate', 'fixture', 'probe', 'ip-probe']:
            with self.subTest(action=action), patch.object(render.subprocess, 'run') as run:
                with self.assertRaisesRegex(SystemExit, 'without --authorized'):
                    render.main([action])
                run.assert_not_called()

    def test_failed_gate_probe_suspends_the_edge(self):
        self.prepared()
        self.quiet(render.assemble)
        with patch.object(render, 'tools', side_effect=render.subprocess.CalledProcessError(1, 'gate-check')), \
             patch.dict(render.os.environ, {'RENDER_API_KEY': 'synthetic'}), patch.object(render.urllib.request, 'urlopen') as urlopen:
            with self.assertRaisesRegex(SystemExit, 'suspended'):
                render.probe()
        self.assertTrue(urlopen.call_args.args[0].full_url.endswith(f"/services/{VALID['EDGE_SERVICE_ID']}/suspend"))
        with patch.object(render, 'tools', side_effect=render.subprocess.CalledProcessError(1, 'gate-check')):
            with self.assertRaisesRegex(SystemExit, 'SUSPEND the edge'):
                render.probe()

    def test_review_window_is_fourteen_days_and_extensions_are_recorded(self):
        self.prepared()
        self.assertIn('not started', self.quiet(render.window))
        self.quiet(render.window, True)
        start = render.datetime.fromisoformat(json.loads(render.INSTANCE.read_text())['windowStart'])
        with redirect_stdout(io.StringIO()):
            self.assertEqual(render.window(), start + render.timedelta(days=14))
        with self.assertRaisesRegex(SystemExit, 'reason'):
            render.window(False, 3)
        with redirect_stdout(io.StringIO()):
            self.assertEqual(render.window(False, 3, 'mentor requested more time'), start + render.timedelta(days=17))
        with self.assertRaisesRegex(SystemExit, 'already started'):
            render.window(True)


if __name__ == '__main__':
    unittest.main()
