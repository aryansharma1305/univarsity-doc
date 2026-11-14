import type { INestApplication } from '@nestjs/common';
import {
  issuedActivationCodesSchema,
  studentAccountListSchema,
  type IssuedActivationCodes,
} from '@docversity/validation';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  browser,
  createTestApp,
  createTestUser,
  errorOf,
  realConfig,
  signIn,
  staff,
  testDb,
  type Staff,
} from '../helpers.js';
import { activatedStudent, issueCode, newRegistration } from './support.js';

let app: INestApplication;
let registrar: Staff;
beforeAll(async () => {
  app = await createTestApp(realConfig());
  registrar = await staff(app, ['REGISTRAR']);
});
afterAll(async () => {
  await app.close();
});

const listFor = async (query: string) =>
  studentAccountListSchema.parse(
    (await registrar.get(`student-accounts?${query}`).expect(200)).body,
  );

describe('student account administration', () => {
  it('is limited to SUPER_ADMIN and REGISTRAR, and needs CSRF for changes', async () => {
    for (const role of ['VIEWER', 'EXAM_ADMIN', 'APPROVER'] as const) {
      const member = await staff(app, [role]);
      expect((await member.get('student-accounts')).status, role).toBe(403);
      expect(
        (await member.post('student-accounts/activation-codes', { registrationIds: [] })).status,
        role,
      ).toBe(403);
    }
    const user = await createTestUser({ roles: ['REGISTRAR'] });
    const agent = browser(app);
    await signIn(agent, user);
    const registration = await newRegistration();
    const noCsrf = await agent
      .post('/api/v1/student-accounts/activation-codes')
      .send({ registrationIds: [registration.registrationId] });
    expect(errorOf(noCsrf).code).toBe('CSRF_INVALID');
    expect(
      await testDb().studentActivationCode.count({
        where: { studentRegistrationId: registration.registrationId },
      }),
    ).toBe(0);
  });

  it('tracks the portal state of each registration', async () => {
    const fresh = await newRegistration('STATE');
    const search = (number: string) => listFor(`search=${encodeURIComponent(number)}`);
    expect((await search(fresh.registrationNumber)).data[0]).toMatchObject({
      state: 'NO_ACCOUNT',
      account: null,
      openCode: null,
    });

    await issueCode(registrar, fresh.registrationId);
    const issued = (await search(fresh.registrationNumber)).data[0];
    expect(issued?.state).toBe('CODE_ISSUED');
    expect(issued?.openCode?.expiresAt).toBeDefined();
    expect(JSON.stringify(issued)).not.toMatch(/codeHash|code_hash/);

    await testDb().studentActivationCode.updateMany({
      where: { studentRegistrationId: fresh.registrationId },
      data: {
        issuedAt: new Date(Date.now() - 2 * 86_400_000),
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    expect((await search(fresh.registrationNumber)).data[0]?.state).toBe('CODE_EXPIRED');

    const active = await activatedStudent(app, registrar, 'STATE');
    expect((await search(active.registrationNumber)).data[0]).toMatchObject({
      state: 'ACTIVE',
      account: { status: 'ACTIVE' },
    });
    const filtered = await listFor(
      `state=ACTIVE&search=${encodeURIComponent(active.registrationNumber)}`,
    );
    expect(filtered.meta.total).toBe(1);
    expect(
      (await listFor(`state=NO_ACCOUNT&search=${encodeURIComponent(active.registrationNumber)}`))
        .meta.total,
    ).toBe(0);
  });

  it('issues codes for every registration of an import, skipping revoked registrations', async () => {
    const a = await newRegistration('IMP');
    const b = await newRegistration('IMP');
    const revoked = await newRegistration('IMP');
    await testDb().studentRegistration.update({
      where: { id: revoked.registrationId },
      data: { status: 'REVOKED' },
    });
    const job = await testDb().importJob.create({
      data: {
        type: 'STUDENTS',
        originalFilename: 'fixture.xlsx',
        status: 'COMPLETED',
        rows: {
          create: [a, b, revoked].map((registration, index) => ({
            rowNumber: index + 2,
            status: 'IMPORTED' as const,
            action: 'CREATE' as const,
            registrationId: registration.registrationId,
            rawData: {},
          })),
        },
      },
    });
    const filtered = await listFor(`importJobId=${job.id}`);
    expect(filtered.meta.total).toBe(3);

    const response = await registrar
      .post('student-accounts/activation-codes', { importJobId: job.id })
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const result = issuedActivationCodesSchema.parse(response.body);
    expect(result.issued.map((row) => row.registrationNumber).sort()).toEqual(
      [a.registrationNumber, b.registrationNumber].sort(),
    );
    expect(result.skipped).toEqual([
      {
        registrationId: revoked.registrationId,
        registrationNumber: revoked.registrationNumber,
        reason: 'The registration is revoked.',
      },
    ]);
    expect(
      await testDb().auditLog.count({
        where: { action: 'STUDENT_ACTIVATION_CODE_ISSUED', entityId: a.registrationId },
      }),
    ).toBe(1);
  });

  it('rejects unknown registrations and malformed requests', async () => {
    const response = await registrar.post('student-accounts/activation-codes', {
      registrationIds: ['0199a8f0-0000-7000-8000-00000000beef'],
    });
    expect(response.status).toBe(404);
    expect((await registrar.post('student-accounts/activation-codes', {})).status).toBe(400);
    expect(
      (
        await registrar.post('student-accounts/0199a8f0-0000-7000-8000-00000000beef/status', {
          status: 'LOCKED',
        })
      ).status,
    ).toBe(404);
  });

  it('withholds a code when a concurrent suspension owns the registration lock first', async () => {
    const db = testDb();
    const registration = await newRegistration('CONCURRENT');
    let issuance: Promise<IssuedActivationCodes> | undefined;
    await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM student_registrations WHERE id=${registration.registrationId}::uuid FOR UPDATE`;
        const [owner] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        if (!owner) throw new Error('Missing lock owner');
        issuance = registrar
          .post('student-accounts/activation-codes', {
            registrationIds: [registration.registrationId],
          })
          .expect(200)
          .then((response) => issuedActivationCodesSchema.parse(response.body));
        // Wait for a real database lock conflict, not a timing-based sleep or service mock.
        await vi.waitFor(
          async () => {
            const [blocked] = await db.$queryRaw<{ waiting: boolean }[]>`
              SELECT EXISTS (
                SELECT 1 FROM pg_stat_activity a
                WHERE a.datname=current_database()
                  AND ${owner.pid}::int = ANY(pg_blocking_pids(a.pid))
              ) AS waiting`;
            expect(blocked?.waiting).toBe(true);
          },
          { timeout: 10_000, interval: 20 },
        );
        await tx.studentRegistration.update({
          where: { id: registration.registrationId },
          data: { status: 'SUSPENDED' },
        });
      },
      { timeout: 15_000 },
    );
    if (!issuance) throw new Error('Missing concurrent issuance');
    const result = await issuance;
    expect(result.issued.length).toBe(0);
    expect(result.skipped).toEqual([
      {
        registrationId: registration.registrationId,
        registrationNumber: registration.registrationNumber,
        reason: 'The registration is suspended.',
      },
    ]);
    expect(
      await db.studentActivationCode.count({
        where: { studentRegistrationId: registration.registrationId },
      }),
    ).toBe(0);
  });
});
