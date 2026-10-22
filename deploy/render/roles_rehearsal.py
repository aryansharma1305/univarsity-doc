#!/usr/bin/env python3
"""Phase 14C (G2) local rehearsal of migration/runtime role separation on a MANAGED PostgreSQL.

Emulates the managed-database situation in a throwaway PostgreSQL 17 container (tmpfs, no volume):
the administrative user is NOT a superuser, only CREATEROLE + CREATEDB, and owns the application
database — the privileges Render documents for its default user (confirmed live by role-probe.sql).
Then, exactly as the Render deployment will:

1. role-probe.sql (read-only) as the administrative user;
2. roles.sql as the administrative user (owner + runtime roles, schema handed to the owner);
3. every Prisma migration as docversity_owner, with the Phase 14B tools image;
4. the base and reviewer synthetic fixtures as the runtime role, through the Render host guard;
5. assertions: the owner owns every table; the runtime role has exactly SELECT/INSERT/UPDATE/DELETE
   and cannot create, alter, drop or truncate anything; the administrative user keeps no membership
   in the owner role; a second roles.sql run fails instead of changing anything.

Throwaway container and network only, removed afterwards. Needs Docker and docversity14b-tools:local.
"""
from pathlib import Path
import json
import os
import secrets
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
POSTGRES = next(line.split('image:', 1)[1].strip() for line in (ROOT / 'deploy/compose.yml').read_text().splitlines() if 'image: postgres:' in line)
TOOLS = os.environ.get('RENDER_TOOLS_IMAGE', 'docversity14b-tools:local')
NETWORK = 'docversity14c-roles-rehearsal'
DB = 'docversity14c-roles-postgres'
ADMIN = 'render_admin'


def run(*args, **kwargs):
    return subprocess.run(args, capture_output=True, text=True, **kwargs)


def psql(user, password, sql=None, file=None, variables=()):
    # Secrets travel as environment variables, never as argv (as in render.py).
    env = dict(os.environ, PGPASSWORD=password, **dict(variables))
    args = ['docker', 'exec', '-i', '-e', 'PGPASSWORD', *[a for k, _ in variables for a in ('-e', k)], DB, 'psql', '-h', '127.0.0.1', '-U', user,
            '-d', 'docversity_staging', '-v', 'ON_ERROR_STOP=1', '-Atq']
    if sql is not None:
        args += ['-c', sql]
    else:
        args += ['-f', '-']
    return run(*args, input=Path(file).read_text() if file else None, env=env)


def main():
    passwords = {name: secrets.token_hex(24) for name in ['super', 'admin', 'owner', 'app']}
    results, failures = [], []

    def check(name, ok, **details):
        results.append({'check': name, **details, 'result': 'PASS' if ok else 'FAIL'})
        if not ok:
            failures.append(name)

    try:
        run('docker', 'network', 'create', NETWORK, check=True)
        superuser = dict(os.environ, POSTGRES_PASSWORD=passwords['super'], PGPASSWORD=passwords['super'])
        run('docker', 'run', '-d', '--name', DB, '--network', NETWORK, '--tmpfs', '/var/lib/postgresql/data',
            '-e', 'POSTGRES_PASSWORD', POSTGRES, check=True, env=superuser)
        for _ in range(120):
            if run('docker', 'exec', DB, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres').returncode == 0:
                break
            time.sleep(0.5)
        time.sleep(1)  # the image restarts the server once after initialisation
        for _ in range(60):
            if run('docker', 'exec', DB, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres').returncode == 0:
                break
            time.sleep(0.5)
        # The managed-database starting point: a non-superuser administrator owning the database.
        run('docker', 'exec', '-i', '-e', 'PGPASSWORD', DB, 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1',
            input=f"CREATE ROLE {ADMIN} LOGIN PASSWORD '{passwords['admin']}' NOSUPERUSER CREATEDB CREATEROLE;\n"
                  f'CREATE DATABASE docversity_staging OWNER {ADMIN};\n', check=True, env=superuser)

        probe = psql(ADMIN, passwords['admin'], file=ROOT / 'deploy/render/role-probe.sql')
        check('role-probe.sql (read-only) as the managed administrator', probe.returncode == 0, output=probe.stdout.strip()[-200:])

        applied = psql(ADMIN, passwords['admin'], file=ROOT / 'deploy/render/roles.sql',
                       variables=[('OWNER_PASSWORD', passwords['owner']), ('APP_PASSWORD', passwords['app'])])
        check('roles.sql as a non-superuser administrator', applied.returncode == 0, error=applied.stderr.strip()[-300:])

        with tempfile.TemporaryDirectory() as directory:
            runtime = Path(directory) / 'runtime'
            runtime.write_text(f"DATABASE_URL=postgresql://docversity_owner:{passwords['owner']}@{DB}:5432/docversity_staging\n")
            runtime.chmod(0o444)
            migrated = run('docker', 'run', '--rm', '--network', NETWORK, '--read-only', '--cap-drop', 'ALL',
                           '-v', f'{runtime}:/run/secrets/runtime:ro', TOOLS)
            check('all Prisma migrations as docversity_owner', migrated.returncode == 0, exit=migrated.returncode,
                  tail=(migrated.stdout + migrated.stderr).strip().splitlines()[-1][:160] if (migrated.stdout + migrated.stderr).strip() else '')

            # Synthetic fixtures as the RUNTIME role through the Phase 14C host guard (render.py fixture).
            credentials = Path(directory) / 'credentials'
            credentials.mkdir()
            password = lambda: secrets.token_urlsafe(24)
            (credentials / 'fixture.json').write_text(json.dumps({'email': 'staging.admin@example.invalid', 'staffPassword': password(),
                                                                  'registrationNumber': 'STAGING-REG-0001', 'studentPassword': password()}))
            (credentials / 'reviewers.json').write_text(json.dumps({
                'gate': {'username': 'reviewer', 'password': password()},
                'staff': [{'role': role, 'email': f'review.{n}@example.invalid', 'displayName': f'SYNTHETIC {role} (review)', 'password': password()}
                          for role, n in [('SUPER_ADMIN', 'admin'), ('REGISTRAR', 'registrar'), ('EXAM_ADMIN', 'exams')]],
                'student': {'registrationNumber': 'REVIEW-REG-1001', 'password': password()}}))
            app_runtime = Path(directory) / 'app_runtime'
            app_runtime.write_text(f"DATABASE_URL=postgresql://docversity_app:{passwords['app']}@{DB}:5432/docversity_staging\n")
            for path in [*credentials.iterdir(), app_runtime]:
                path.chmod(0o444)
            for script in ['fixture.mjs', 'review-fixture.mjs']:
                seeded = run('docker', 'run', '--rm', '--network', NETWORK, '--read-only', '--tmpfs', '/tmp', '--cap-drop', 'ALL',
                             '-e', f'STAGING_DATABASE_HOST={DB}', '-v', f'{app_runtime}:/run/secrets/runtime:ro',
                             '-v', f"{ROOT / 'deploy/scripts'}:/operations:ro", '-v', f'{credentials}:/credentials:ro',
                             TOOLS, 'node', f'/operations/{script}')
                check(f'{script} as the runtime role (Render host guard)', seeded.returncode == 0,
                      tail=(seeded.stdout + seeded.stderr).strip().splitlines()[-1][:160] if (seeded.stdout + seeded.stderr).strip() else '')
            guarded = run('docker', 'run', '--rm', '--network', NETWORK, '--read-only', '--cap-drop', 'ALL',
                          '-e', 'STAGING_DATABASE_HOST=some-other-host', '-v', f'{app_runtime}:/run/secrets/runtime:ro',
                          '-v', f"{ROOT / 'deploy/scripts'}:/operations:ro", '-v', f'{credentials}:/credentials:ro',
                          TOOLS, 'node', '/operations/fixture.mjs')
            check('fixture refuses a database host other than the configured one', guarded.returncode != 0 and 'Not isolated staging' in guarded.stderr)
        synthetic = psql('docversity_app', passwords['app'], "SELECT count(*), count(*) FILTER (WHERE full_name LIKE 'SYNTHETIC %') FROM students").stdout.strip()
        check('every seeded student is SYNTHETIC', synthetic.split('|')[0] == synthetic.split('|')[1] != '0', students=synthetic)

        owners = psql(ADMIN, passwords['admin'], "SELECT tableowner, count(*) FROM pg_tables WHERE schemaname='public' GROUP BY 1").stdout.strip()
        check('owner owns every table', owners.startswith('docversity_owner|') and '\n' not in owners, owners=owners)

        privileges = psql('docversity_app', passwords['app'], """
            SELECT count(*) FILTER (WHERE has_table_privilege('docversity_app', format('public.%I', tablename), 'SELECT,INSERT,UPDATE,DELETE')),
                   count(*) FILTER (WHERE has_table_privilege('docversity_app', format('public.%I', tablename), 'TRUNCATE')
                                       OR has_table_privilege('docversity_app', format('public.%I', tablename), 'REFERENCES')
                                       OR has_table_privilege('docversity_app', format('public.%I', tablename), 'TRIGGER')),
                   count(*)
            FROM pg_tables WHERE schemaname='public'""").stdout.strip()
        dml, extra, total = (int(x) for x in privileges.split('|'))
        check('runtime role: DML on every table, nothing more', dml == total and extra == 0 and total > 30, tables=total, dml=dml, extra=extra)
        read = psql('docversity_app', passwords['app'], 'SELECT count(*) FROM users')
        check('runtime role reads application data', read.returncode == 0, users=read.stdout.strip())

        for name, statement in {
            'CREATE TABLE': 'CREATE TABLE public.intruder (id int)',
            'ALTER TABLE': 'ALTER TABLE public.users ADD COLUMN intruder int',
            'DROP TABLE': 'DROP TABLE public.audit_logs',
            'TRUNCATE': 'TRUNCATE public.audit_logs',
            'CREATE SCHEMA': 'CREATE SCHEMA intruder',
            'CREATE FUNCTION': 'CREATE FUNCTION public.intruder() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$',
            'CREATE ROLE': 'CREATE ROLE intruder',
        }.items():
            attempt = psql('docversity_app', passwords['app'], statement)
            check(f'runtime role refused: {name}', attempt.returncode != 0 and ('permission denied' in attempt.stderr or 'must be owner' in attempt.stderr),
                  error=attempt.stderr.strip().splitlines()[-1][:120] if attempt.stderr.strip() else '')

        membership = psql(ADMIN, passwords['admin'], f"SELECT pg_has_role('{ADMIN}', 'docversity_owner', 'SET'), pg_has_role('{ADMIN}', 'docversity_owner', 'USAGE')").stdout.strip()
        check('administrator keeps no SET/USAGE on the owner role', membership == 'f|f', set_usage=membership)
        attrs = psql(ADMIN, passwords['admin'], "SELECT string_agg(rolname || ':' || rolsuper::int || rolcreaterole::int || rolcreatedb::int || rolinherit::int, ',' ORDER BY rolname) FROM pg_roles WHERE rolname LIKE 'docversity_%'").stdout.strip()
        check('owner and runtime roles: no superuser/createrole/createdb/inherit', attrs == 'docversity_app:0000,docversity_owner:0000', attributes=attrs)

        again = psql(ADMIN, passwords['admin'], file=ROOT / 'deploy/render/roles.sql',
                     variables=[('OWNER_PASSWORD', 'x' * 48), ('APP_PASSWORD', 'y' * 48)])
        check('second roles.sql run refuses (no silent password rotation)', again.returncode != 0 and 'already exists' in again.stderr)
    finally:
        run('docker', 'rm', '-f', '-v', DB)
        run('docker', 'network', 'rm', NETWORK)
    print(json.dumps(results, indent=2))
    if failures:
        raise SystemExit(f'FAIL: managed role separation rehearsal: {failures}')
    print(f'PASS: migration owner and runtime roles are separated on a non-superuser managed database ({len(results)} checks)')


if __name__ == '__main__':
    main()
