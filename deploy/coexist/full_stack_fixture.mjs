// Synthetic-only operator fixture for the fresh projects created by full_stack.py.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, chownSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createPrismaClient } from '/app/packages/database/dist/index.js';
import { createAdmin } from '/app/apps/api/dist/cli/create-admin-core.js';
import {
  buildWorkbook,
  generatedStudents,
  studentSheet,
} from '/app/packages/imports/dist/testing.js';

assert.equal(process.env.SYNTHETIC_COEXIST, 'true');
const fixture = JSON.parse(readFileSync('/credentials/fixture.json', 'utf8'));
assert.equal(fixture.marker, 'SYNTHETIC COEXISTENCE ONLY');
assert.ok(['STAGE', 'UNIVERSITY'].includes(fixture.label));
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, 'postgres');
assert.equal(url.pathname, '/docversity_university');
const require = createRequire('/app/packages/storage/package.json');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});
const db = createPrismaClient({ connectionString: process.env.DATABASE_URL });
try {
  if (process.argv[2] === 'verify-foreign') {
    const foreign = Object.fromEntries(
      readFileSync('/credentials/foreign-runtime', 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
    );
    assert.equal(new URL(foreign.DATABASE_URL).hostname, 'postgres');
    assert.equal(new URL(foreign.REDIS_URL).hostname, 'redis');
    assert.equal(new URL(foreign.S3_ENDPOINT).hostname, 'minio');
    async function denied(operation, pattern) {
      let message = '';
      try {
        await operation();
      } catch (error) {
        message = String(error?.message ?? '');
      }
      assert.ok(pattern.test(message), 'Expected a specific foreign-credential rejection');
    }
    const wrongDb = createPrismaClient({ connectionString: foreign.DATABASE_URL });
    try {
      await denied(
        () => wrongDb.$queryRawUnsafe('SELECT 1'),
        /password authentication failed|P1000|28P01/i,
      );
    } finally {
      await wrongDb.$disconnect();
    }
    const apiRequire = createRequire('/app/apps/api/package.json');
    const Redis = apiRequire('ioredis').default;
    const wrongRedis = new Redis(foreign.REDIS_URL, {
      lazyConnect: true,
      retryStrategy: () => null,
      maxRetriesPerRequest: 0,
      connectTimeout: 2000,
    });
    wrongRedis.on('error', () => {});
    try {
      await denied(async () => {
        await wrongRedis.connect();
        await wrongRedis.ping();
      }, /WRONGPASS|invalid username-password/i);
    } finally {
      wrongRedis.disconnect();
    }
    const wrongS3 = new S3Client({
      endpoint: foreign.S3_ENDPOINT,
      region: foreign.S3_REGION,
      forcePathStyle: true,
      credentials: { accessKeyId: foreign.S3_ACCESS_KEY, secretAccessKey: foreign.S3_SECRET_KEY },
    });
    try {
      await denied(
        () =>
          wrongS3.send(
            new GetObjectCommand({
              Bucket: process.env.S3_BUCKET,
              Key: 'synthetic/coexist-canary',
            }),
          ),
        /signature|access key|credentials/i,
      );
    } finally {
      wrongS3.destroy();
    }
    console.log('PASS: PostgreSQL, Redis and MinIO rejected the other environment credentials');
  } else if (process.argv[2] === 'verify') {
    const object = await s3.send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: 'synthetic/coexist-canary' }),
    );
    assert.equal(await object.Body.transformToString(), fixture.label);
    assert.equal(await db.department.count({ where: { code: `COEX-${fixture.label}` } }), 1);
    console.log('PASS: independent synthetic database/object markers');
  } else {
    assert.equal(process.argv[2], 'seed');
    assert.equal(await db.user.count(), 0);
    assert.equal(await db.student.count(), 0);
    for (const role of ['SUPER_ADMIN', 'REGISTRAR', 'EXAM_ADMIN']) {
      const account = fixture.staff[role];
      assert.ok(account.email.endsWith('.example.invalid'));
      await createAdmin(db, { ...account, role, displayName: `SYNTHETIC ${role}` });
    }
    const department = await db.department.create({
      data: { code: `COEX-${fixture.label}`, name: `SYNTHETIC ${fixture.label}` },
    });
    const program = await db.program.create({
      data: {
        code: `COEX-${fixture.label}`,
        name: `SYNTHETIC ${fixture.label}`,
        level: 'UG',
        durationSemesters: 2,
        departmentId: department.id,
      },
    });
    const session = await db.academicSession.create({
      data: { code: 'COEX-2026', name: 'SYNTHETIC 2026', status: 'ACTIVE' },
    });
    for (const student of fixture.students) {
      const created = await db.student.create({
        data: {
          fullName: 'SYNTHETIC Student',
          registrations: {
            create: {
              registrationNumber: student.registrationNumber,
              registrationNumberNormalized: student.registrationNumber,
              departmentId: department.id,
              programId: program.id,
              academicSessionId: session.id,
            },
          },
        },
        include: { registrations: true },
      });
      student.registrationId = created.registrations[0].id;
    }
    const workbook = await buildWorkbook([
      studentSheet(
        generatedStudents(58, {
          prefix: `COEX-${fixture.label}`,
          programCode: program.code,
          academicSessionCode: session.code,
        }),
      ),
    ]);
    writeFileSync('/credentials/synthetic-58.xlsx', workbook, { mode: 0o600 });
    const apiRequire = createRequire('/app/apps/api/package.json');
    const sharp = apiRequire('sharp');
    const photo = await sharp(randomBytes(1024 * 1024 * 3), {
      raw: { width: 1024, height: 1024, channels: 3 },
    })
      .png()
      .toBuffer();
    writeFileSync('/credentials/synthetic-photo.png', photo, { mode: 0o600 });
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: 'synthetic/coexist-canary',
        Body: fixture.label,
      }),
    );
    writeFileSync('/credentials/fixture.json', JSON.stringify(fixture), { mode: 0o600 });
    for (const name of ['fixture.json', 'synthetic-58.xlsx', 'synthetic-photo.png']) {
      chownSync(
        `/credentials/${name}`,
        Number(process.env.LOCAL_UID),
        Number(process.env.LOCAL_GID),
      );
    }
    console.log(
      'Created only synthetic staff, two unactivated registrations, generated workbook/photo and canary.',
    );
  }
} finally {
  s3.destroy();
  await db.$disconnect();
}
