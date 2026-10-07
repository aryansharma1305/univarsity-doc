import { afterAll, describe, expect, it } from 'vitest';
import { createTestClient, expectDbError, uid } from '../support/db.js';
import { fixtures } from '../support/fixtures.js';

const db = createTestClient();
const f = fixtures(db);
afterAll(() => db.$disconnect());

describe('test helper sanity', () => {
  it('expectDbError fails when nothing is rejected or the wrong error is raised', async () => {
    await expect(expectDbError(Promise.resolve(1), /anything/)).rejects.toThrow(
      /Expected the database/,
    );
    await expect(expectDbError(Promise.reject(new Error('other')), /P2002/)).rejects.toThrow(
      /did not match/,
    );
  });
});

describe('referenced academic records cannot be deleted', () => {
  it('protects programs, sessions, students and registrations that are in use', async () => {
    const reg = await f.registration();
    await expectDbError(db.program.delete({ where: { id: reg.programId } }), /P2003/);
    await expectDbError(
      db.academicSession.delete({ where: { id: reg.academicSessionId } }),
      /P2003/,
    );
    await expectDbError(db.student.delete({ where: { id: reg.studentId } }), /P2003/);

    const exam = await f.examination(reg.programId, reg.academicSessionId);
    await db.result.create({ data: { studentRegistrationId: reg.id, examinationId: exam.id } });
    await expectDbError(db.studentRegistration.delete({ where: { id: reg.id } }), /P2003/);
    await expectDbError(db.examination.delete({ where: { id: exam.id } }), /P2003/);
  });

  it('protects subjects used in a curriculum and curriculum lines used by results', async () => {
    const { registration, examination } = await f.examContext();
    const line = await f.programSubject(registration.programId);
    await expectDbError(db.subject.delete({ where: { id: line.subjectId } }), /P2003/);
    await db.result.create({
      data: {
        studentRegistrationId: registration.id,
        examinationId: examination.id,
        items: { create: { programSubjectId: line.id, status: 'PASS' } },
      },
    });
    await expectDbError(db.programSubject.delete({ where: { id: line.id } }), /P2003/);
  });

  it('protects a registration that has certificates', async () => {
    const { registration } = await f.issuedCertificate();
    await expectDbError(db.studentRegistration.delete({ where: { id: registration.id } }), /P2003/);
  });

  it('still allows deleting unused master data', async () => {
    const program = await f.program();
    await db.program.delete({ where: { id: program.id } });
  });
});

describe('decimal precision', () => {
  it('round-trips marks, credits, grade points and GPAs exactly', async () => {
    const { registration, examination } = await f.examContext();
    const line = await f.programSubject(registration.programId);
    const result = await db.result.create({
      data: {
        studentRegistrationId: registration.id,
        examinationId: examination.id,
        totalMarks: '12345.67',
        maxMarks: '99999.99',
        sgpa: '9.125',
        cgpa: '8.375',
        items: {
          create: {
            programSubjectId: line.id,
            internalMarks: '39.75',
            externalMarks: '0.25',
            totalMarks: '40',
            maxMarks: '100',
            gradePoint: '7.333',
            creditsAttempted: '1.5',
            creditsEarned: '1.5',
            status: 'PASS',
          },
        },
      },
      include: { items: true },
    });
    const stored = await db.result.findUniqueOrThrow({
      where: { id: result.id },
      include: { items: true },
    });
    expect(stored.totalMarks?.toFixed(2)).toBe('12345.67');
    expect(stored.maxMarks?.toFixed(2)).toBe('99999.99');
    expect(stored.sgpa?.toFixed(3)).toBe('9.125');
    expect(stored.cgpa?.toFixed(3)).toBe('8.375');
    const item = stored.items[0];
    expect(item?.internalMarks?.toFixed(2)).toBe('39.75');
    expect(item?.externalMarks?.toFixed(2)).toBe('0.25');
    expect(item?.gradePoint?.toFixed(3)).toBe('7.333');
    expect(item?.creditsEarned?.toFixed(2)).toBe('1.50');
    // Exact decimal arithmetic (no binary floating-point drift).
    expect(item?.internalMarks?.plus(item.externalMarks ?? 0).toFixed(2)).toBe('40.00');
  });

  it('rejects values beyond the declared precision instead of truncating', async () => {
    const { registration, examination } = await f.examContext();
    await expectDbError(
      db.result.create({
        data: {
          studentRegistrationId: registration.id,
          examinationId: examination.id,
          totalMarks: '123456.78',
        },
      }),
      /P2020|out of range|overflow/i,
    );
    const reg2 = await f.examContext();
    await expectDbError(
      db.result.create({
        data: {
          studentRegistrationId: reg2.registration.id,
          examinationId: reg2.examination.id,
          sgpa: '100',
        },
      }),
      /P2020|out of range|overflow/i,
    );
  });
});

describe('imports', () => {
  it('stores rows under their job, unique per row number, removed with the job', async () => {
    const job = await db.importJob.create({
      data: {
        type: 'STUDENTS',
        originalFilename: 'fixture.xlsx',
        totalRows: 2,
        rows: {
          create: [
            { rowNumber: 2, status: 'VALID', rawData: { A: 'x' } },
            {
              rowNumber: 3,
              status: 'ERROR',
              rawData: { A: '' },
              errors: [{ field: 'A', code: 'required' }],
            },
          ],
        },
      },
      include: { rows: true },
    });
    expect(job.rows).toHaveLength(2);
    expect(await db.importRow.count({ where: { importJobId: job.id, status: 'ERROR' } })).toBe(1);

    await expectDbError(
      db.importRow.create({
        data: { importJobId: job.id, rowNumber: 2, status: 'VALID', rawData: {} },
      }),
      /P2002[\s\S]*import_rows_import_job_id_row_number_key/,
    );
    await expectDbError(
      db.importRow.create({
        data: { importJobId: job.id, rowNumber: 0, status: 'VALID', rawData: {} },
      }),
      /import_rows_row_number_check/,
    );
    await expectDbError(
      db.importJob.update({ where: { id: job.id }, data: { errorRows: -1 } }),
      /import_jobs_counts_check/,
    );

    await db.importJob.delete({ where: { id: job.id } });
    expect(await db.importRow.count({ where: { importJobId: job.id } })).toBe(0);
  });
});

describe('users and roles', () => {
  it('assigns roles through user_roles', async () => {
    const role = await db.role.create({ data: { name: `T-ROLE-${uid()}` } });
    const user = await db.user.create({
      data: {
        email: `t.${uid()}@example.test`.toLowerCase(),
        displayName: 'Test user',
        roles: { create: { roleId: role.id } },
      },
      include: { roles: { include: { role: true } } },
    });
    expect(user.roles.map((link) => link.role.name)).toEqual([role.name]);

    await expectDbError(
      db.userRole.create({ data: { userId: user.id, roleId: role.id } }),
      /P2002/,
    );
    await expectDbError(
      db.role.create({ data: { name: role.name } }),
      /P2002[\s\S]*roles_name_key/,
    );
    await expectDbError(db.role.delete({ where: { id: role.id } }), /P2003/);

    await db.user.delete({ where: { id: user.id } });
    expect(await db.userRole.count({ where: { roleId: role.id } })).toBe(0);
  });
});

describe('append-only logs', () => {
  it('rejects updating or deleting audit log entries', async () => {
    const entry = await db.auditLog.create({
      data: { action: 'test.created', entityType: 'Test', entityId: uid(), metadata: { ok: true } },
    });
    await expectDbError(
      db.auditLog.update({ where: { id: entry.id }, data: { action: 'test.tampered' } }),
      /DV001[\s\S]*audit_logs: UPDATE is not allowed/,
    );
    await expectDbError(
      db.auditLog.delete({ where: { id: entry.id } }),
      /audit_logs: DELETE is not allowed/,
    );
    await expectDbError(
      db.$executeRawUnsafe('TRUNCATE audit_logs'),
      /audit_logs: TRUNCATE is not allowed/,
    );
  });

  it('rejects updating verification logs but keeps deletion available for retention', async () => {
    const { certificate } = await f.issuedCertificate();
    const entry = await db.verificationLog.create({
      data: {
        type: 'QR',
        outcome: 'VALID',
        certificateId: certificate.id,
        referenceHash: 'h'.repeat(64),
      },
    });
    await expectDbError(
      db.verificationLog.update({ where: { id: entry.id }, data: { outcome: 'INVALID' } }),
      /verification_logs: UPDATE is not allowed/,
    );
    await db.verificationLog.delete({ where: { id: entry.id } });
  });
});

describe('number sequences and legacy mappings', () => {
  it('increments a sequence atomically with UPDATE … RETURNING', async () => {
    const key = `T-SEQ-${uid()}`;
    await db.numberSequence.create({ data: { key, prefix: 'TEST/' } });
    const values = await Promise.all(
      Array.from(
        { length: 10 },
        () =>
          db.$queryRaw<{ current_value: bigint }[]>`
          UPDATE number_sequences SET current_value = current_value + 1, updated_at = now()
          WHERE key = ${key} RETURNING current_value`,
      ),
    );
    const allocated = values.map((rows) => Number(rows[0]?.current_value)).sort((a, b) => a - b);
    expect(allocated).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    await expectDbError(
      db.numberSequence.create({ data: { key: `T-SEQ-${uid()}`, padding: 0 } }),
      /number_sequences_values_check/,
    );
  });

  it('maps a legacy identifier to exactly one target', async () => {
    const { certificate } = await f.issuedCertificate();
    const mapping = {
      sourceSystem: 'TEST',
      sourceEntity: 'certificate',
      sourceIdentifier: `LEGACY-${uid()}`,
      targetEntity: 'Certificate',
      targetId: certificate.id,
    };
    await db.legacyMapping.create({ data: mapping });
    await expectDbError(
      db.legacyMapping.create({ data: mapping }),
      /P2002[\s\S]*legacy_mappings_source_system_source_entity_source_identifi_key/,
    );
  });
});
