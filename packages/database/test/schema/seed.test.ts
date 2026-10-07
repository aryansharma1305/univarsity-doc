import { afterAll, describe, expect, it } from 'vitest';
import { seedDevelopmentFixtures } from '../../src/seed/development-fixtures.js';
import { createTestClient } from '../support/db.js';

const db = createTestClient();
afterAll(() => db.$disconnect());

describe('development seed', () => {
  it('is idempotent and creates only clearly-labelled fixtures — no results or certificates', async () => {
    await seedDevelopmentFixtures(db);
    await seedDevelopmentFixtures(db);

    const registrations = await db.studentRegistration.findMany({
      where: { registrationNumber: { startsWith: 'DEV-REG-' } },
      include: { student: true },
    });
    expect(registrations.map((r) => r.registrationNumber).sort()).toEqual([
      'DEV-REG-0001',
      'DEV-REG-0002',
    ]);
    expect(registrations.every((r) => r.student.fullName.startsWith('Development Fixture'))).toBe(
      true,
    );
    expect(await db.program.count({ where: { code: { startsWith: 'DEV-PROG-' } } })).toBe(2);
    expect(await db.examination.count({ where: { code: 'DEV-EXAM-0001' } })).toBe(1);

    const scheme = await db.gradingScheme.findFirstOrThrow({
      where: { name: { contains: 'DEV FIXTURE' } },
    });
    expect(scheme.status).toBe('DRAFT');
    expect(scheme.rules).toMatchObject({ fixture: true });

    const fixtureRegistrationIds = registrations.map((r) => r.id);
    expect(
      await db.result.count({ where: { studentRegistrationId: { in: fixtureRegistrationIds } } }),
    ).toBe(0);
    expect(
      await db.certificate.count({
        where: { studentRegistrationId: { in: fixtureRegistrationIds } },
      }),
    ).toBe(0);
  });
});
