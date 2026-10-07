import { afterAll, describe, expect, it } from 'vitest';
import { createTestClient, expectDbError, uid } from '../support/db.js';
import { fixtures, token } from '../support/fixtures.js';

const db = createTestClient();
const f = fixtures(db);
afterAll(() => db.$disconnect());

describe('human identifiers (separate from UUID primary keys)', () => {
  it('generates UUIDv7 primary keys', async () => {
    const program = await f.program();
    expect(program.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('rejects duplicate program codes', async () => {
    const program = await f.program();
    await expectDbError(
      db.program.create({ data: { code: program.code, name: 'Duplicate' } }),
      /P2002[\s\S]*programs_code_key/,
    );
  });

  it('rejects untrimmed or empty codes', async () => {
    await expectDbError(
      db.program.create({ data: { code: ' T-PAD ', name: 'x' } }),
      /programs_code_format_check/,
    );
    await expectDbError(
      db.department.create({ data: { code: '', name: 'x' } }),
      /departments_code_format_check/,
    );
  });

  it('allows the same subject code in different versions but not twice in one version', async () => {
    const code = `T-SUB-${uid()}`;
    await db.subject.create({ data: { code, version: 1, name: 'Syllabus 2020' } });
    await db.subject.create({ data: { code, version: 2, name: 'Syllabus 2024' } });
    await expectDbError(
      db.subject.create({ data: { code, version: 2, name: 'Again' } }),
      /P2002[\s\S]*subjects_code_version_key/,
    );
  });
});

describe('registration numbers', () => {
  it('rejects duplicate registration numbers', async () => {
    const reg = await f.registration();
    const other = await f.registration();
    await expectDbError(
      db.studentRegistration.update({
        where: { id: other.id },
        data: {
          registrationNumber: reg.registrationNumber,
          registrationNumberNormalized: reg.registrationNumberNormalized,
        },
      }),
      /P2002[\s\S]*registration_number_normalized_key/,
    );
  });

  it('treats registration numbers that differ only by case as duplicates', async () => {
    const reg = await f.registration();
    const lower = reg.registrationNumber.toLowerCase();
    await expectDbError(
      db.studentRegistration.create({
        data: {
          registrationNumber: lower,
          registrationNumberNormalized: lower.toUpperCase(),
          programId: reg.programId,
          academicSessionId: reg.academicSessionId,
          studentId: reg.studentId,
        },
      }),
      /P2002[\s\S]*registration_number_normalized_key/,
    );
  });

  it('never lets the normalised number disagree with the official one', async () => {
    const reg = await f.registration();
    await expectDbError(
      db.studentRegistration.update({
        where: { id: reg.id },
        data: { registrationNumberNormalized: `${reg.registrationNumberNormalized}-X` },
      }),
      /student_registrations_registration_number_check/,
    );
  });

  it('lets one person hold several registrations', async () => {
    const first = await f.registration();
    const second = await f.registration();
    const moved = await db.studentRegistration.update({
      where: { id: second.id },
      data: { studentId: first.studentId },
    });
    const person = await db.student.findUniqueOrThrow({
      where: { id: moved.studentId },
      include: { registrations: true },
    });
    expect(person.registrations.length).toBeGreaterThanOrEqual(2);
  });

  it('does not require a date of birth', async () => {
    const reg = await f.registration();
    const student = await db.student.findUniqueOrThrow({ where: { id: reg.studentId } });
    expect(student.dateOfBirth).toBeNull();
  });
});

describe('certificate number and verification token', () => {
  it('rejects duplicate certificate numbers but allows any number of unassigned (NULL) ones', async () => {
    const { certificate } = await f.issuedCertificate();
    const reg = await f.registration();
    const draft = {
      studentRegistrationId: reg.id,
      programId: reg.programId,
      documentType: 'CHARACTER',
    } as const;
    await db.certificate.create({ data: draft });
    await db.certificate.create({ data: draft });
    await expectDbError(
      db.certificate.create({
        data: { ...draft, certificateNumber: certificate.certificateNumber },
      }),
      /P2002[\s\S]*certificates_certificate_number_key/,
    );
  });

  it('rejects duplicate verification tokens', async () => {
    const { certificate } = await f.issuedCertificate();
    const reg = await f.registration();
    await expectDbError(
      db.certificate.create({
        data: {
          studentRegistrationId: reg.id,
          programId: reg.programId,
          documentType: 'PROVISIONAL',
          verificationToken: certificate.verificationToken,
        },
      }),
      /P2002[\s\S]*certificates_verification_token_key/,
    );
  });

  it('rejects verification tokens shorter than 22 characters (< ~128 bits)', async () => {
    const reg = await f.registration();
    await expectDbError(
      db.certificate.create({
        data: {
          studentRegistrationId: reg.id,
          programId: reg.programId,
          documentType: 'PROVISIONAL',
          verificationToken: 'too-short',
        },
      }),
      /certificates_token_check/,
    );
    expect(token().length).toBeGreaterThanOrEqual(22);
  });
});

describe('users', () => {
  it('stores emails lower-case so uniqueness is case-insensitive', async () => {
    await expectDbError(
      db.user.create({ data: { email: `Mixed.${uid()}@Example.test`, displayName: 'x' } }),
      /users_email_check/,
    );
    const email = `user.${uid()}@example.test`.toLowerCase();
    await db.user.create({ data: { email, displayName: 'First' } });
    await expectDbError(
      db.user.create({ data: { email, displayName: 'Second' } }),
      /P2002[\s\S]*users_email_key/,
    );
  });
});
