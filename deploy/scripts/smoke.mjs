import assert from 'node:assert/strict';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const fixture = JSON.parse(readFileSync('/credentials/fixture.json', 'utf8'));
const ca = readFileSync('/credentials/local-ca.crt');
const { createPrismaClient } = await import('/app/packages/database/dist/index.js');
const db = createPrismaClient({ connectionString: process.env.DATABASE_URL });
try {
  const [role] = await db.$queryRawUnsafe(
    "SELECT rolsuper, rolcreatedb, rolcreaterole, has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create FROM pg_roles WHERE rolname=current_user",
  );
  assert.deepEqual(role, {
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
    schema_create: false,
  });
} finally {
  await db.$disconnect();
}

async function request(
  path,
  { method = 'GET', data, cookies = '', origin = 'https://localhost:3443', token } = {},
) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'proxy',
        port: 443,
        servername: 'localhost',
        ca,
        path,
        method,
        timeout: 30000,
        headers: {
          Host: 'localhost:3443',
          Origin: origin,
          Cookie: cookies,
          ...(data ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { 'X-CSRF-Token': token } : {}),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(Error('HTTPS deadline')));
    req.end(data ? JSON.stringify(data) : undefined);
  });
}
const cookie = (response) =>
  (response.headers['set-cookie'] ?? []).map((s) => s.split(';')[0]).join('; ');
const health = await request('/health');
assert.equal(health.status, 200);
assert.equal(JSON.parse(health.body).status, 'ok');
assert.equal((await request('/')).status, 200);
assert.equal((await request('/api/v1/student/results')).status, 401);
assert.equal((await request('/api/v1/certificate-templates')).status, 401);
assert.equal((await request('/api/docs')).status, 404);
assert.equal(
  (
    await request('/api/v1/auth/login', {
      method: 'POST',
      data: { email: fixture.email, password: fixture.staffPassword },
    })
  ).status,
  403,
);
for (const student of [false, true]) {
  const prefix = student ? 'student-auth' : 'auth';
  const csrf = await request(`/api/v1/${prefix}/csrf`);
  assert.equal(csrf.status, 200);
  const cookies = cookie(csrf);
  const token = JSON.parse(csrf.body).csrfToken;
  const data = student
    ? { registrationNumber: fixture.registrationNumber, password: fixture.studentPassword }
    : { email: fixture.email, password: fixture.staffPassword };
  const rejected = await request(`/api/v1/${prefix}/login`, {
    method: 'POST',
    data,
    cookies,
    token,
    origin: 'https://evil.invalid',
  });
  assert.equal(rejected.status, 403);
  const login = await request(`/api/v1/${prefix}/login`, { method: 'POST', data, cookies, token });
  assert.equal(login.status, 200);
  const session = login.headers['set-cookie'].find((s) =>
    s.startsWith(student ? '__Host-dv_student=' : '__Host-dv_session='),
  );
  assert.match(session, /Secure/i);
  assert.match(session, /HttpOnly/i);
  assert.match(session, /SameSite=Lax/i);
  assert.match(session, /Path=\//i);
  assert.doesNotMatch(session, /Domain=/i);
  const sessionCookies = cookie(login);
  if (!student) {
    const pdf = await request(
      '/api/v1/certificate-templates/preview?templateId=sample-training&version=1&fixture=standard',
      { cookies: sessionCookies },
    );
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers['content-type'], /application\/pdf/);
    assert.equal(pdf.headers['cache-control'], 'no-store');
    assert.ok(pdf.body.startsWith('%PDF-'));
  }
  assert.equal(
    (await request(`/api/v1/${student ? 'student' : 'auth'}/me`, { cookies: sessionCookies }))
      .status,
    200,
  );
  assert.equal(
    (await request(`/api/v1/${student ? 'auth' : 'student'}/me`, { cookies: sessionCookies }))
      .status,
    401,
  );
  const foreign = await request('/api/v1/auth/csrf', { origin: 'https://evil.invalid' });
  assert.notEqual(foreign.headers['access-control-allow-origin'], 'https://evil.invalid');
}
const apiRequire = createRequire('/app/apps/api/package.json');
const Redis = apiRequire('ioredis').default;
const redis = new Redis(process.env.REDIS_URL);
try {
  await assert.rejects(redis.set('outside-staging:probe', 'synthetic'), /NOPERM/);
} finally {
  await redis.quit();
}
const require = createRequire('/app/packages/storage/package.json');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3');
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});
try {
  const Body = 'SYNTHETIC PHASE 14A BACKUP FIXTURE — no university records\n';
  await s3.send(
    new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: 'synthetic/staging.txt', Body }),
  );
  const object = await s3.send(
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: 'synthetic/staging.txt' }),
  );
  assert.equal(await object.Body.transformToString(), Body);
  const buckets = await s3.send(new ListBucketsCommand({}));
  assert.deepEqual(
    (buckets.Buckets ?? []).map((b) => b.Name),
    [process.env.S3_BUCKET],
  );
  await assert.rejects(
    s3.send(new ListObjectsV2Command({ Bucket: 'docversity-staging-canary' })),
    (error) => error.name === 'AccessDenied',
  );
  assert.equal(
    (await fetch('http://minio:9000/docversity-staging/synthetic/staging.txt')).status,
    403,
  );
} finally {
  s3.destroy();
}
console.log(
  'PASS: trusted local HTTPS, real dependency health, production staff/student cookies and isolation, CSRF, CORS, private object storage and denied access to the separate private canary bucket.',
);
