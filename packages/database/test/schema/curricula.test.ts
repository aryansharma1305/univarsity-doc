import { afterAll, describe, expect, it } from 'vitest';
import { createTestClient, expectDbError, uid } from '../support/db.js';
import { fixtures } from '../support/fixtures.js';

const db = createTestClient();
const f = fixtures(db);
afterAll(() => db.$disconnect());

/** A program with a DRAFT curriculum holding one subject in period 1. */
async function draftCurriculum(options: { periods?: number; from?: string; to?: string } = {}) {
  const program = await f.program();
  const curriculum = await db.programCurriculum.create({
    data: {
      programId: program.id,
      versionCode: `V-${uid()}`,
      name: 'Synthetic curriculum',
      structureType: 'SEMESTER_WISE',
      numberOfPeriods: options.periods ?? 2,
      effectiveFrom: options.from ? new Date(`${options.from}T00:00:00Z`) : null,
      effectiveTo: options.to ? new Date(`${options.to}T00:00:00Z`) : null,
    },
  });
  const subject = await db.subject.create({
    data: { code: `S-${uid()}`, name: 'Synthetic subject' },
  });
  const line = await db.programSubject.create({
    data: {
      programId: program.id,
      curriculumId: curriculum.id,
      subjectId: subject.id,
      semesterNumber: 1,
      curriculumVersion: 'IGNORED',
    },
  });
  return { program, curriculum, subject, line };
}

const activate = (id: string) =>
  db.programCurriculum.update({
    where: { id },
    data: { status: 'ACTIVE', activatedAt: new Date() },
  });

describe('curriculum lifecycle (program_curricula_guard)', () => {
  it('creates curricula as DRAFT and mirrors the version label onto assignments', async () => {
    const { program, curriculum, line } = await draftCurriculum();
    expect(line.curriculumVersion).toBe(curriculum.versionCode);
    await db.programCurriculum.update({
      where: { id: curriculum.id },
      data: { versionCode: 'RENAMED' },
    });
    const reread = await db.programSubject.findUniqueOrThrow({ where: { id: line.id } });
    expect(reread.curriculumVersion).toBe('RENAMED');
    await expectDbError(
      db.programCurriculum.create({
        data: {
          programId: program.id,
          versionCode: `V-${uid()}`,
          name: 'x',
          structureType: 'YEAR_WISE',
          numberOfPeriods: 1,
          status: 'ACTIVE',
          activatedAt: new Date(),
        },
      }),
      /created as DRAFT/,
    );
  });

  it('needs a subject to activate, then freezes the definition except the end date', async () => {
    const program = await f.program();
    const empty = await db.programCurriculum.create({
      data: {
        programId: program.id,
        versionCode: 'EMPTY',
        name: 'Empty',
        structureType: 'YEAR_WISE',
        numberOfPeriods: 1,
      },
    });
    await expectDbError(activate(empty.id), /at least one subject/);

    const { curriculum, line, subject } = await draftCurriculum();
    await activate(curriculum.id);
    await expectDbError(
      db.programCurriculum.update({ where: { id: curriculum.id }, data: { name: 'Changed' } }),
      /read-only/,
    );
    await expectDbError(
      db.programSubject.update({ where: { id: line.id }, data: { credits: '9' } }),
      /not a draft/,
    );
    await expectDbError(db.programSubject.delete({ where: { id: line.id } }), /not a draft/);
    await expectDbError(
      db.programSubject.create({
        data: {
          programId: curriculum.programId,
          curriculumId: curriculum.id,
          subjectId: subject.id,
          semesterNumber: 2,
          curriculumVersion: 'x',
        },
      }),
      /not a draft|P2002/,
    );
    await expectDbError(
      db.programCurriculum.delete({ where: { id: curriculum.id } }),
      /cannot be deleted/,
    );
    await db.programCurriculum.update({
      where: { id: curriculum.id },
      data: { effectiveTo: new Date('2030-12-31T00:00:00Z') },
    });
    await expectDbError(
      db.programCurriculum.update({
        where: { id: curriculum.id },
        data: { status: 'DRAFT', activatedAt: null },
      }),
      /can only be archived/,
    );
    await db.programCurriculum.update({
      where: { id: curriculum.id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    await expectDbError(
      db.programCurriculum.update({
        where: { id: curriculum.id },
        data: { effectiveTo: new Date('2031-01-01T00:00:00Z') },
      }),
      /archived curriculum .* read-only/,
    );
    // Archived versions and their subjects remain readable.
    expect(await db.programSubject.count({ where: { curriculumId: curriculum.id } })).toBe(1);
  });

  it('keeps assignments inside the curriculum’s periods', async () => {
    const { curriculum, line } = await draftCurriculum({ periods: 2 });
    await expectDbError(
      db.programSubject.update({ where: { id: line.id }, data: { semesterNumber: 3 } }),
      /outside the curriculum/,
    );
    await db.programSubject.update({ where: { id: line.id }, data: { semesterNumber: 2 } });
    await expectDbError(
      db.programCurriculum.update({ where: { id: curriculum.id }, data: { numberOfPeriods: 1 } }),
      /beyond period 1/,
    );
  });

  it('refuses overlapping effective periods between ACTIVE versions of one program', async () => {
    const first = await draftCurriculum({ from: '2025-01-01', to: '2025-12-31' });
    await activate(first.curriculum.id);
    const subject = await db.subject.create({ data: { code: `S-${uid()}`, name: 'Second' } });
    const make = async (versionCode: string, from: string | null, to: string | null) => {
      const curriculum = await db.programCurriculum.create({
        data: {
          programId: first.program.id,
          versionCode,
          name: versionCode,
          structureType: 'SEMESTER_WISE',
          numberOfPeriods: 2,
          effectiveFrom: from ? new Date(`${from}T00:00:00Z`) : null,
          effectiveTo: to ? new Date(`${to}T00:00:00Z`) : null,
        },
      });
      await db.programSubject.create({
        data: {
          programId: first.program.id,
          curriculumId: curriculum.id,
          subjectId: subject.id,
          semesterNumber: 1,
          curriculumVersion: 'x',
        },
      });
      return curriculum;
    };
    const overlapping = await make('OVERLAP', '2025-06-01', null);
    await expectDbError(activate(overlapping.id), /overlaps active curriculum/);
    const openEnded = await make('OPEN', null, null);
    await expectDbError(activate(openEnded.id), /overlaps/);
    const next = await make('NEXT', '2026-01-01', null);
    await activate(next.id);
    // Extending the first version into the next one's period is refused too.
    await expectDbError(
      db.programCurriculum.update({
        where: { id: first.curriculum.id },
        data: { effectiveTo: new Date('2026-06-30T00:00:00Z') },
      }),
      /overlaps/,
    );
  });

  it('serialises concurrent activations so only one overlapping version becomes ACTIVE', async () => {
    const a = await draftCurriculum();
    const subject = await db.subject.create({ data: { code: `S-${uid()}`, name: 'Race' } });
    const b = await db.programCurriculum.create({
      data: {
        programId: a.program.id,
        versionCode: 'RACE-B',
        name: 'B',
        structureType: 'SEMESTER_WISE',
        numberOfPeriods: 2,
      },
    });
    await db.programSubject.create({
      data: {
        programId: a.program.id,
        curriculumId: b.id,
        subjectId: subject.id,
        semesterNumber: 1,
        curriculumVersion: 'x',
      },
    });
    const results = await Promise.allSettled([activate(a.curriculum.id), activate(b.id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await db.programCurriculum.count({ where: { programId: a.program.id, status: 'ACTIVE' } }),
    ).toBe(1);
  });
});

describe('registration curriculum (registration_curriculum_guard)', () => {
  it('assigns only ACTIVE versions of the registration’s own program', async () => {
    const { program, curriculum } = await draftCurriculum();
    const registration = await f.registration({ programId: program.id });
    await expectDbError(
      db.studentRegistration.update({
        where: { id: registration.id },
        data: { curriculumId: curriculum.id },
      }),
      /only an active curriculum/,
    );
    await activate(curriculum.id);
    await db.studentRegistration.update({
      where: { id: registration.id },
      data: { curriculumId: curriculum.id },
    });

    const other = await draftCurriculum();
    await activate(other.curriculum.id);
    const foreign = await f.registration();
    await expectDbError(
      db.studentRegistration.update({
        where: { id: foreign.id },
        data: { curriculumId: other.curriculum.id },
      }),
      /another program/,
    );
    // Moving an assigned registration to another program is refused while the curriculum is set.
    await expectDbError(
      db.studentRegistration.update({
        where: { id: registration.id },
        data: { programId: other.program.id },
      }),
      /another program/,
    );
    // Archiving keeps existing assignments (historical records stay linked).
    await db.programCurriculum.update({
      where: { id: curriculum.id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    const kept = await db.studentRegistration.findUniqueOrThrow({ where: { id: registration.id } });
    expect(kept.curriculumId).toBe(curriculum.id);
    await expectDbError(
      db.programCurriculum.delete({ where: { id: curriculum.id } }),
      /cannot be deleted|P2003/,
    );
  });

  it('freezes the assignment once the registration has results', async () => {
    const { program, curriculum } = await draftCurriculum();
    await activate(curriculum.id);
    const registration = await f.registration({ programId: program.id });
    await db.studentRegistration.update({
      where: { id: registration.id },
      data: { curriculumId: curriculum.id },
    });
    const exam = await f.examination(program.id, registration.academicSessionId);
    await db.result.create({
      data: { studentRegistrationId: registration.id, examinationId: exam.id },
    });
    await expectDbError(
      db.studentRegistration.update({
        where: { id: registration.id },
        data: { curriculumId: null },
      }),
      /has results/,
    );
  });
});

describe('catalogue and legacy academic history', () => {
  it('freezes catalogue identity in active and archived versions while allowing retirement', async () => {
    const { curriculum, subject } = await draftCurriculum();
    await db.subject.update({ where: { id: subject.id }, data: { name: 'Corrected draft title' } });
    await activate(curriculum.id);
    await expectDbError(
      db.subject.update({ where: { id: subject.id }, data: { name: 'Rewritten history' } }),
      /academic history/,
    );
    await expectDbError(
      db.subject.update({ where: { id: subject.id }, data: { code: 'RENAMED' } }),
      /academic history/,
    );
    await db.subject.update({
      where: { id: subject.id },
      data: { status: 'INACTIVE', defaultCredits: 6 },
    });
    await db.programCurriculum.update({
      where: { id: curriculum.id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    await expectDbError(
      db.subject.update({ where: { id: subject.id }, data: { category: 'PRACTICAL' } }),
      /academic history/,
    );
    expect((await db.subject.findUniqueOrThrow({ where: { id: subject.id } })).name).toBe(
      'Corrected draft title',
    );
  });

  it('protects legacy result references even when the backfilled version is DRAFT and registration unassigned', async () => {
    const old = await f.publishedResult();
    const line = old.programSubject;
    await expectDbError(
      db.programSubject.update({ where: { id: line.id }, data: { credits: 9 } }),
      /referenced by results/,
    );
    await expectDbError(db.programSubject.delete({ where: { id: line.id } }), /P2003|foreign key/);
    await expectDbError(
      db.programCurriculum.update({
        where: { id: line.curriculumId },
        data: { structureType: 'YEAR_WISE' },
      }),
      /referenced by results/,
    );
    await expectDbError(
      db.subject.update({
        where: { id: line.subjectId },
        data: { name: 'Renamed old result subject' },
      }),
      /academic history/,
    );
    await activate(line.curriculumId);
    await expectDbError(
      db.studentRegistration.update({
        where: { id: old.registration.id },
        data: { curriculumId: line.curriculumId },
      }),
      /has results/,
    );
    expect(
      (await db.studentRegistration.findUniqueOrThrow({ where: { id: old.registration.id } }))
        .curriculumId,
    ).toBeNull();
  });
});
