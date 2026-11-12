import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import https from 'node:https';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const fixture = JSON.parse(readFileSync('/credentials/fixture.json', 'utf8'));
const ca = readFileSync('/credentials/local-ca.crt');
// The configured origin (Phase 14B instances use their own port) and, behind the Phase 14B
// reviewer gate, its credentials.
const origin = new URL(process.env.WEB_URL);
const gate = existsSync('/credentials/reviewers.json')
  ? JSON.parse(readFileSync('/credentials/reviewers.json', 'utf8')).gate
  : null;
const authorization = gate
  ? {
      Authorization: `Basic ${Buffer.from(`${gate.username}:${gate.password}`).toString('base64')}`,
    }
  : {};
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
  { method = 'GET', data, cookies = '', origin: requestOrigin = origin.origin, token } = {},
) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: process.env.GATE_CHECK_HOST ?? 'proxy',
        port: 443,
        servername: origin.hostname,
        ...(ca.length ? { ca } : {}),
        path,
        method,
        timeout: 30000,
        headers: {
          Host: origin.host,
          Origin: requestOrigin,
          ...authorization,
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
  // Production mode never inherits test-only workflow policies or sample publication authority.
  const sessionCsrf = await request(`/api/v1/${prefix}/csrf`, { cookies: sessionCookies });
  assert.equal(sessionCsrf.status, 200);
  const write = {
    method: 'POST',
    cookies: sessionCookies,
    token: JSON.parse(sessionCsrf.body).csrfToken,
  };
  if (student) {
    const results = await request('/api/v1/student/results', { cookies: sessionCookies });
    assert.equal(results.status, 200);
    assert.equal(JSON.parse(results.body).publicationAvailable, false);
    assert.deepEqual(JSON.parse(results.body).data, []);
    const catalogue = await request('/api/v1/student/certificate-services', {
      cookies: sessionCookies,
    });
    assert.equal(catalogue.status, 200);
    assert.ok(JSON.parse(catalogue.body).data.every((service) => service.available === false));
    assert.equal(
      (await request('/api/v1/student/retotaling', { cookies: sessionCookies })).status,
      404,
    );
    assert.equal(
      (
        await request('/api/v1/student/sandbox-gateway/orders', {
          ...write,
          data: { requestId: randomUUID(), paymentId: randomUUID() },
        })
      ).status,
      404,
    );
  } else {
    assert.equal(
      (
        await request('/api/v1/synthetic-workflows/releases', {
          ...write,
          data: {
            requestId: randomUUID(),
            registrationId: randomUUID(),
            kind: 'REGISTRATION',
            confirmed: true,
          },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request(`/api/v1/certificate-requests/${randomUUID()}/synthetic-credential`, {
          ...write,
          data: { requestId: randomUUID(), registrationId: randomUUID(), confirmed: true },
        })
      ).status,
      404,
    );
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
for (const service of ['result', 'registration', 'certificate', 'admission-letter']) {
  const response = await request(`/api/v1/public/verify/${service}`, {
    method: 'POST',
    data: { contractVersion: 1, reference: 'SYN-UNAVAILABLE-REFERENCE' },
  });
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.body).status, 'UNAVAILABLE');
  assert.equal(response.headers['cache-control'], 'no-store');
}
assert.equal(
  (
    await request('/api/v1/sandbox-gateway/callback', {
      method: 'POST',
      data: {
        payloadBase64: 'e30=',
        timestamp: String(Math.floor(Date.now() / 1000)),
        signature: '0'.repeat(64),
      },
    })
  ).status,
  404,
);
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
