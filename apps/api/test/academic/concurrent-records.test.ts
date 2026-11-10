import type { INestApplication } from '@nestjs/common';
import { MemoryObjectStorage } from '@docversity/storage';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, realConfig, staff, testDb, type Staff, uniqueCode } from '../helpers.js';
import { activatedStudent } from '../student-auth/support.js';
import { images, submitRequest } from '../student-profile/support.js';

let app: INestApplication;
let registrar: Staff;
const storage = new MemoryObjectStorage();
beforeAll(async () => {
  app = await createTestApp(realConfig(), { objectStorage: storage });
  registrar = await staff(app, ['REGISTRAR']);
});
afterAll(async () => {
  await app.close();
});

async function waitForBlockedWrite(table: 'students' | 'student_registrations') {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const blocked = await testDb().$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid()
        AND wait_event_type = 'Lock' AND query LIKE ${`%${table}%`}
    `;
    if (Number(blocked[0]?.count) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Expected synthetic API write to wait on fixture row lock');
}

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('academic record concurrency', () => {
  it('audits a manual student edit against the current locked record', async () => {
    const student = await activatedStudent(app, registrar);
    await testDb().student.update({
      where: { id: student.studentId },
      data: { fullName: 'Synthetic Alpha' },
    });
    const locked = signal(),
      release = signal();
    const holding = testDb().$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM students WHERE id = ${student.studentId}::uuid FOR UPDATE`;
        await tx.student.update({
          where: { id: student.studentId },
          data: { fullName: 'Synthetic Beta' },
        });
        locked.resolve();
        await release.promise;
      },
      { timeout: 15_000 },
    );
    await locked.promise;
    const editing = registrar
      .patch(`students/${student.studentId}`, { fullName: 'Synthetic Alpha' })
      .then((response) => response);
    try {
      await waitForBlockedWrite('students');
    } finally {
      release.resolve();
      await holding;
    }
    expect((await editing).status).toBe(200);
    const audits = await testDb().auditLog.findMany({
      where: { action: 'STUDENT_UPDATED', entityId: student.studentId },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.metadata).toMatchObject({ changedFields: ['fullName'] });
  });

  it('does not restore obsolete registration relations during a status-only edit', async () => {
    const student = await activatedStudent(app, registrar);
    const session = await testDb().academicSession.create({
      data: { code: uniqueCode('S15A'), name: 'Synthetic alternate session', status: 'ACTIVE' },
    });
    const locked = signal(),
      release = signal();
    const holding = testDb().$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM student_registrations WHERE id = ${student.registrationId}::uuid FOR UPDATE`;
        await tx.studentRegistration.update({
          where: { id: student.registrationId },
          data: { academicSessionId: session.id },
        });
        locked.resolve();
        await release.promise;
      },
      { timeout: 15_000 },
    );
    await locked.promise;
    const editing = registrar
      .patch(`registrations/${student.registrationId}`, { status: 'COMPLETED' })
      .then((response) => response);
    try {
      await waitForBlockedWrite('student_registrations');
    } finally {
      release.resolve();
      await holding;
    }
    expect((await editing).status).toBe(200);
    const saved = await testDb().studentRegistration.findUniqueOrThrow({
      where: { id: student.registrationId },
    });
    expect(saved.academicSessionId).toBe(session.id);
    expect(saved.status).toBe('COMPLETED');
  });

  it('revalidates missing-DOB policy against the submission snapshot', async () => {
    const student = await activatedStudent(app, registrar);
    const objectKeys = [...storage.objects.keys()].sort();
    const put = storage.putObject.bind(storage);
    const upload = vi.spyOn(storage, 'putObject').mockImplementationOnce(async (...args) => {
      await put(...args);
      await registrar
        .patch(`students/${student.studentId}`, { dateOfBirth: '2000-01-01' })
        .expect(200);
    });
    try {
      const response = await submitRequest(
        student.agent,
        { dateOfBirth: '2001-04-05' },
        {
          photo: { bytes: await images.jpeg(), contentType: 'image/jpeg' },
        },
      );
      expect(response.status).toBe(400);
      expect([...storage.objects.keys()].sort()).toEqual(objectKeys);
      const saved = await testDb().student.findUniqueOrThrow({ where: { id: student.studentId } });
      expect(saved.dateOfBirth?.toISOString().slice(0, 10)).toBe('2000-01-01');
      expect(
        await testDb().studentProfileChangeRequest.count({
          where: { studentId: student.studentId },
        }),
      ).toBe(0);
    } finally {
      upload.mockRestore();
    }
  });
});
