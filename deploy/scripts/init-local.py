#!/usr/bin/env python3
"""Generate local-only staging secrets once. Never reads the development .env."""
from pathlib import Path
import secrets
import json

root = Path(__file__).resolve().parents[2]
directory = root / '.local/staging'
if directory.exists():
    raise SystemExit('Staging secrets already exist; refusing to overwrite.')
directory.mkdir(parents=True, mode=0o700)
(root / '.local/backups').mkdir(mode=0o700, exist_ok=True)
values = {key: secrets.token_hex(32) for key in ['bootstrap', 'owner', 'app', 'redis', 'session', 'minio', 's3']}
files = {
    'database_bootstrap_password': values['bootstrap'],
    'database_owner_password': values['owner'],
    'database_app_password': values['app'],
    'redis_password': values['redis'],
    'redis_config': f"bind 0.0.0.0\nprotected-mode yes\nuser default off\nuser docversity on >{values['redis']} ~staging:* &staging:* +@all -@admin -flushall -flushdb\nappendonly yes\nmaxmemory 192mb\nmaxmemory-policy noeviction\n",
    'web_runtime': 'NODE_ENV=production\nAPI_INTERNAL_URL=http://api:4000\nWEB_BEHIND_TRUSTED_PROXY=true\n',
    'migration_runtime': f"DATABASE_URL=postgresql://docversity_owner:{values['owner']}@postgres:5432/docversity_staging\n",
    'minio': f"MINIO_ROOT_USER=staging_owner\nMINIO_ROOT_PASSWORD={values['minio']}\nS3_BUCKET=docversity-staging\nS3_ACCESS_KEY=staging_app\nS3_SECRET_KEY={values['s3']}\n",
    'runtime': f"""NODE_ENV=production
LOG_LEVEL=log
API_HOST=0.0.0.0
API_PORT=4000
WEB_URL=https://localhost:3443
CORS_ORIGINS=https://localhost:3443
SWAGGER_ENABLED=false
TRUST_PROXY=2
COOKIE_SECURE=true
SESSION_SECRET={values['session']}
DATABASE_URL=postgresql://docversity_app:{values['app']}@postgres:5432/docversity_staging
REDIS_URL=redis://docversity:{values['redis']}@redis:6379
REDIS_KEY_PREFIX=staging:
QUEUE_PREFIX=staging
S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_BUCKET=docversity-staging
S3_ACCESS_KEY=staging_app
S3_SECRET_KEY={values['s3']}
S3_FORCE_PATH_STYLE=true
WORKER_CONCURRENCY=1
IMPORT_CONCURRENCY=1
""",
}
worker_keys = {'NODE_ENV', 'LOG_LEVEL', 'DATABASE_URL', 'REDIS_URL', 'QUEUE_PREFIX', 'S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_FORCE_PATH_STYLE', 'WORKER_CONCURRENCY', 'IMPORT_CONCURRENCY'}
files['worker_runtime'] = '\n'.join(line for line in files['runtime'].splitlines() if line.split('=', 1)[0] in worker_keys or line.startswith('IMPORT_'))
files['local-ca.crt'] = ''
files['fixture.json'] = json.dumps({'email': 'staging.admin@example.invalid', 'staffPassword': secrets.token_urlsafe(24), 'registrationNumber': 'STAGING-REG-0001', 'studentPassword': secrets.token_urlsafe(24)})
for name, text in files.items():
    path = directory / name
    path.write_text(text.rstrip() + '\n')
    path.chmod(0o644 if name == 'local-ca.crt' else 0o444)  # Read-only inside non-root containers; host parent remains 0700.
print('Generated isolated staging secrets; no credentials printed.')
