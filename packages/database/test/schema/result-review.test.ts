import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import type { Prisma } from '../../src/index.js';
import { createTestClient, expectDbError } from '../support/db.js';
import { fixtures } from '../support/fixtures.js';
const db = createTestClient(),
  f = fixtures(db);
afterAll(() => db.$disconnect());
async function context() {
  const base = await f.examContext();
  const line = await f.programSubject(base.registration.programId);
  await db.programCurriculum.update({
    where: { id: line.curriculumId },
    data: { status: 'ACTIVE', activatedAt: new Date() },
  });
  await db.studentRegistration.update({
    where: { id: base.registration.id },
    data: { curriculumId: line.curriculumId },
  });
  await db.examination.update({
    where: { id: base.examination.id },
    data: { curriculumId: line.curriculumId, status: 'OPEN' },
  });
  const result = await db.result.create({
    data: { studentRegistrationId: base.registration.id, examinationId: base.examination.id },
  });
  const item = await db.resultItem.create({
    data: { resultId: result.id, programSubjectId: line.id, internalMarks: 0 },
  });
  const actor = await db.user.create({
    data: { email: `review-${randomUUID()}@example.invalid`, displayName: 'Synthetic reviewer' },
  });
  return { ...base, line, result, item, actor };
}
async function snapshot(id: string) {
  const rows = await db.$queryRaw<
    { snapshot: Prisma.InputJsonValue }[]
  >`SELECT docversity_result_review_snapshot(${id}::uuid) AS snapshot`;
  const value = rows[0]?.snapshot;
  if (!value) throw Error('Missing snapshot');
  return value;
}
describe('review receipt integrity', () => {
  it('rejects a receipt without the matching atomic state transition', async () => {
    const c = await context();
    await expectDbError(
      db.resultReviewEvent.create({
        data: {
          id: randomUUID(),
          resultId: c.result.id,
          actorUserId: c.actor.id,
          action: 'SUBMIT',
          fromStatus: 'DRAFT',
          toStatus: 'UNDER_REVIEW',
          resultVersion: 2,
          requestDigest: 'a'.repeat(64),
          snapshot: await snapshot(c.result.id),
        },
      }),
      /result_review_event_committed/,
    );
    expect(await db.resultReviewEvent.count({ where: { resultId: c.result.id } })).toBe(0);
  });
  it('rejects fabricated reviewed marks and unguarded approval inserts', async () => {
    const c = await context();
    await expectDbError(
      db.resultReviewEvent.create({
        data: {
          id: randomUUID(),
          resultId: c.result.id,
          actorUserId: c.actor.id,
          action: 'SUBMIT',
          fromStatus: 'DRAFT',
          toStatus: 'UNDER_REVIEW',
          resultVersion: 2,
          requestDigest: 'a'.repeat(64),
          snapshot: { fabricated: true },
        },
      }),
      /result_review_event_guard/,
    );
    const other = await f.examContext();
    await expectDbError(
      db.result.create({
        data: {
          studentRegistrationId: other.registration.id,
          examinationId: other.examination.id,
          publicationStatus: 'APPROVED',
        },
      }),
      /ungraded_result_guard/,
    );
  });
  it('allows only matching immutable snapshots; locks review marks and blocks publication', async () => {
    const c = await context();
    const marks = await snapshot(c.result.id);
    const id = randomUUID();
    await db.$transaction(async (tx) => {
      await tx.resultReviewEvent.create({
        data: {
          id,
          resultId: c.result.id,
          actorUserId: c.actor.id,
          action: 'SUBMIT',
          fromStatus: 'DRAFT',
          toStatus: 'UNDER_REVIEW',
          resultVersion: 2,
          requestDigest: 'a'.repeat(64),
          snapshot: marks,
        },
      });
      await tx.result.update({
        where: { id: c.result.id },
        data: { publicationStatus: 'UNDER_REVIEW', version: 2 },
      });
    });
    await expectDbError(
      db.resultItem.update({ where: { id: c.item.id }, data: { internalMarks: 1 } }),
      /reviewed_items_guard/,
    );
    await expectDbError(db.resultReviewEvent.delete({ where: { id } }), /append.only|modification/);
    await expectDbError(
      db.result.update({
        where: { id: c.result.id },
        data: { publicationStatus: 'PUBLISHED', publishedAt: new Date(), outcome: 'PASS' },
      }),
      /reviewed_result_guard/,
    );
    await expectDbError(db.result.delete({ where: { id: c.result.id } }), /reviewed_result_guard/);
  });
});
