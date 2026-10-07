import { afterAll, describe, expect, it } from 'vitest';
import { createTestClient, expectDbError } from '../support/db.js';
import { fixtures } from '../support/fixtures.js';

const db = createTestClient();
const f = fixtures(db);
afterAll(() => db.$disconnect());

describe('result items', () => {
  it('allows one line per subject per result revision', async () => {
    const { registration, examination } = await f.examContext();
    const line = await f.programSubject(registration.programId);
    const result = await db.result.create({
      data: { studentRegistrationId: registration.id, examinationId: examination.id },
    });
    await db.resultItem.create({
      data: { resultId: result.id, programSubjectId: line.id, status: 'PASS' },
    });
    await expectDbError(
      db.resultItem.create({
        data: { resultId: result.id, programSubjectId: line.id, status: 'FAIL' },
      }),
      /P2002[\s\S]*result_items_result_id_program_subject_id_key/,
    );
  });

  it('rejects impossible values (negative marks, total above maximum, earned above attempted)', async () => {
    const { registration, examination } = await f.examContext();
    const line = await f.programSubject(registration.programId);
    const result = await db.result.create({
      data: { studentRegistrationId: registration.id, examinationId: examination.id },
    });
    const base = { resultId: result.id, programSubjectId: line.id, status: 'PASS' } as const;
    for (const bad of [
      { internalMarks: '-1' },
      { totalMarks: '101', maxMarks: '100' },
      { creditsAttempted: '3', creditsEarned: '4' },
    ]) {
      await expectDbError(
        db.resultItem.create({ data: { ...base, ...bad } }),
        /result_items_values_check/,
      );
    }
  });

  it('deleting a draft result removes its items (aggregate cascade)', async () => {
    const { registration, examination } = await f.examContext();
    const line = await f.programSubject(registration.programId);
    const result = await db.result.create({
      data: {
        studentRegistrationId: registration.id,
        examinationId: examination.id,
        items: { create: { programSubjectId: line.id, status: 'PASS' } },
      },
    });
    await db.result.delete({ where: { id: result.id } });
    expect(await db.resultItem.count({ where: { resultId: result.id } })).toBe(0);
  });
});

describe('result revisions', () => {
  it('rejects duplicate (registration, examination, attempt, revision)', async () => {
    const { registration, examination } = await f.examContext();
    const key = { studentRegistrationId: registration.id, examinationId: examination.id };
    await db.result.create({ data: key });
    await expectDbError(db.result.create({ data: key }), /P2002/);
  });

  it('requires revision 1 to have no predecessor and later revisions to have one', async () => {
    const { result } = await f.publishedResult();
    await expectDbError(
      db.result.create({
        data: {
          studentRegistrationId: result.studentRegistrationId,
          examinationId: result.examinationId,
          revisionNumber: 2,
        },
      }),
      /results_revision_chain_check/,
    );
  });

  it('corrects a published result by creating and publishing a new revision', async () => {
    const { result: original, programSubject } = await f.publishedResult();

    const correction = await db.result.create({
      data: {
        studentRegistrationId: original.studentRegistrationId,
        examinationId: original.examinationId,
        revisionNumber: 2,
        supersedesResultId: original.id,
        outcome: 'PASS',
        totalMarks: '85',
        maxMarks: '100',
        items: {
          create: {
            programSubjectId: programSubject.id,
            totalMarks: '85',
            maxMarks: '100',
            status: 'PASS',
          },
        },
      },
    });

    // While the correction is prepared, the original stays published and untouched.
    expect(
      (await db.result.findUniqueOrThrow({ where: { id: original.id } })).publicationStatus,
    ).toBe('PUBLISHED');

    await db.$transaction(async (tx) => {
      await tx.result.update({
        where: { id: original.id },
        data: { publicationStatus: 'SUPERSEDED' },
      });
      await tx.result.update({
        where: { id: correction.id },
        data: { publicationStatus: 'PUBLISHED', approvedAt: new Date(), publishedAt: new Date() },
      });
    });

    const history = await db.result.findUniqueOrThrow({
      where: { id: correction.id },
      include: { supersedes: true },
    });
    expect(history.supersedes?.id).toBe(original.id);
    expect(history.supersedes?.publicationStatus).toBe('SUPERSEDED');
    expect(history.supersedes?.totalMarks?.toString()).toBe('80');
  });

  it('allows at most one PUBLISHED revision per attempt', async () => {
    const { result: original } = await f.publishedResult();
    const correction = await db.result.create({
      data: {
        studentRegistrationId: original.studentRegistrationId,
        examinationId: original.examinationId,
        revisionNumber: 2,
        supersedesResultId: original.id,
        outcome: 'PASS',
      },
    });
    await expectDbError(
      db.result.update({
        where: { id: correction.id },
        data: { publicationStatus: 'PUBLISHED', publishedAt: new Date() },
      }),
      /P2002[\s\S]*results_one_published_per_attempt_key/,
    );
  });

  it('allows at most one in-progress revision per attempt', async () => {
    const { result: original } = await f.publishedResult();
    const draft = await db.result.create({
      data: {
        studentRegistrationId: original.studentRegistrationId,
        examinationId: original.examinationId,
        revisionNumber: 2,
        supersedesResultId: original.id,
      },
    });
    await expectDbError(
      db.result.create({
        data: {
          studentRegistrationId: original.studentRegistrationId,
          examinationId: original.examinationId,
          revisionNumber: 3,
          supersedesResultId: draft.id,
        },
      }),
      /P2002[\s\S]*results_one_working_revision_per_attempt_key/,
    );
  });

  it('keeps history linear: a result can be superseded only once', async () => {
    const { result: original } = await f.publishedResult();
    const data = {
      studentRegistrationId: original.studentRegistrationId,
      examinationId: original.examinationId,
      revisionNumber: 2,
      supersedesResultId: original.id,
    };
    await db.result.create({ data });
    await expectDbError(db.result.create({ data: { ...data, attemptNumber: 1 } }), /P2002/);
  });

  it('rejects a revision that supersedes another student’s result', async () => {
    const { result: original } = await f.publishedResult();
    const { registration: other } = await f.examContext();
    await expectDbError(
      db.result.create({
        data: {
          studentRegistrationId: other.id,
          examinationId: original.examinationId,
          revisionNumber: 2,
          supersedesResultId: original.id,
        },
      }),
      /DV001[\s\S]*results_guard/,
    );
  });

  it('cannot mark a result SUPERSEDED before its replacement exists', async () => {
    const { result } = await f.publishedResult();
    await expectDbError(
      db.result.update({ where: { id: result.id }, data: { publicationStatus: 'SUPERSEDED' } }),
      /results_guard: result .* has no replacement/,
    );
  });
});

describe('published results are never silently mutated', () => {
  it('rejects edits to a published result', async () => {
    const { result } = await f.publishedResult();
    await expectDbError(
      db.result.update({ where: { id: result.id }, data: { totalMarks: '99' } }),
      /results_guard: published result .* cannot be edited/,
    );
  });

  it('rejects moving a published result back to draft', async () => {
    const { result } = await f.publishedResult();
    await expectDbError(
      db.result.update({ where: { id: result.id }, data: { publicationStatus: 'DRAFT' } }),
      /results_guard: invalid status transition PUBLISHED -> DRAFT/,
    );
  });

  it('rejects deleting a published result', async () => {
    const { result } = await f.publishedResult();
    await expectDbError(
      db.result.delete({ where: { id: result.id } }),
      /results_guard: .* cannot be deleted/,
    );
  });

  it('freezes the items of a published result', async () => {
    const { result, programSubject, registration } = await f.publishedResult();
    const item = await db.resultItem.findFirstOrThrow({ where: { resultId: result.id } });
    await expectDbError(
      db.resultItem.update({ where: { id: item.id }, data: { totalMarks: '1' } }),
      /result_items_guard: items of a PUBLISHED result are frozen/,
    );
    await expectDbError(db.resultItem.delete({ where: { id: item.id } }), /result_items_guard/);
    const extra = await f.programSubject(registration.programId);
    await expectDbError(
      db.resultItem.create({
        data: { resultId: result.id, programSubjectId: extra.id, status: 'PASS' },
      }),
      /result_items_guard/,
    );
    expect(programSubject.id).toBe(item.programSubjectId);
  });

  it('allows withholding and releasing a published result without changing it', async () => {
    const { result } = await f.publishedResult();
    await db.result.update({ where: { id: result.id }, data: { publicationStatus: 'WITHHELD' } });
    await expectDbError(
      db.result.update({ where: { id: result.id }, data: { sgpa: '9' } }),
      /results_guard: published result/,
    );
    const released = await db.result.update({
      where: { id: result.id },
      data: { publicationStatus: 'PUBLISHED' },
    });
    expect(released.totalMarks?.toString()).toBe('80');
  });

  it('requires an outcome before approval and a publication time when published', async () => {
    const { registration, examination } = await f.examContext();
    const result = await db.result.create({
      data: { studentRegistrationId: registration.id, examinationId: examination.id },
    });
    await expectDbError(
      db.result.update({ where: { id: result.id }, data: { publicationStatus: 'APPROVED' } }),
      /results_publication_check/,
    );
    await expectDbError(
      db.result.update({
        where: { id: result.id },
        data: { publicationStatus: 'PUBLISHED', outcome: 'PASS' },
      }),
      /results_publication_check/,
    );
  });
});
