import { afterAll, describe, it } from 'vitest';
import { createTestClient, expectDbError } from '../support/db.js';
import { fixtures } from '../support/fixtures.js';

const db = createTestClient();
const f = fixtures(db);
afterAll(() => db.$disconnect());

const ARGON =
  '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g';
const HASH = (n: number) => n.toString(16).padStart(64, '0');

/** Phase 6 migration (20261009090000_student_accounts). */
describe('student accounts and activation codes', () => {
  it('allows exactly one account per student, with an Argon2id hash only', async () => {
    const reg = await f.registration();
    await db.studentAccount.create({ data: { studentId: reg.studentId, passwordHash: ARGON } });
    await expectDbError(
      db.studentAccount.create({ data: { studentId: reg.studentId, passwordHash: ARGON } }),
      /P2002/,
    );
    const other = await f.registration();
    await expectDbError(
      db.studentAccount.create({ data: { studentId: other.studentId, passwordHash: 'plaintext' } }),
      /student_accounts_password_hash_check/,
    );
  });

  it('requires a reason to disable an account', async () => {
    const reg = await f.registration();
    const account = await db.studentAccount.create({
      data: { studentId: reg.studentId, passwordHash: ARGON },
    });
    await expectDbError(
      db.studentAccount.update({ where: { id: account.id }, data: { status: 'DISABLED' } }),
      /student_accounts_status_reason_check/,
    );
    await db.studentAccount.update({
      where: { id: account.id },
      data: { status: 'DISABLED', statusReason: 'Test reason' },
    });
  });

  it('keeps at most one open code per registration and a consistent code lifecycle', async () => {
    const reg = await f.registration();
    const expiresAt = new Date(Date.now() + 86_400_000);
    const first = await db.studentActivationCode.create({
      data: { studentRegistrationId: reg.id, codeHash: HASH(Date.now()), expiresAt },
    });
    await expectDbError(
      db.studentActivationCode.create({
        data: { studentRegistrationId: reg.id, codeHash: HASH(Date.now() + 1), expiresAt },
      }),
      /student_activation_codes_one_open_per_registration_key/,
    );
    await db.studentActivationCode.update({
      where: { id: first.id },
      data: { revokedAt: new Date() },
    });
    await db.studentActivationCode.create({
      data: { studentRegistrationId: reg.id, codeHash: HASH(Date.now() + 2), expiresAt },
    });
    await expectDbError(
      db.studentActivationCode.update({ where: { id: first.id }, data: { usedAt: new Date() } }),
      /student_activation_codes_lifecycle_check/,
    );
    await expectDbError(
      db.studentActivationCode.create({
        data: {
          studentRegistrationId: reg.id,
          codeHash: 'not-a-hash'.padEnd(64, 'x'),
          expiresAt,
          revokedAt: new Date(),
        },
      }),
      /student_activation_codes_lifecycle_check/,
    );
    await expectDbError(
      db.studentActivationCode.create({
        data: {
          studentRegistrationId: reg.id,
          codeHash: HASH(Date.now() + 3),
          expiresAt: new Date(Date.now() - 1_000),
          revokedAt: new Date(),
        },
      }),
      /student_activation_codes_lifecycle_check/,
    );
  });
});
