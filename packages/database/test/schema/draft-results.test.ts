import { afterAll, describe, expect, it } from 'vitest';
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
  return { ...base, line, result };
}
describe('draft persistence integrity', () => {
  it('stores ungraded null/zero distinctly and blocks leaving DRAFT until outcomes exist', async () => {
    const c = await context();
    const item = await db.resultItem.create({
      data: { resultId: c.result.id, programSubjectId: c.line.id, internalMarks: '0' },
    });
    expect(item.internalMarks?.toString()).toBe('0');
    expect(item.externalMarks).toBeNull();
    expect(item.status).toBeNull();
    await expectDbError(
      db.result.update({ where: { id: c.result.id }, data: { publicationStatus: 'UNDER_REVIEW' } }),
      /ungraded_result_guard/,
    );
  });
  it('rejects incompatible subjects, missing re-exam application and invalid versions', async () => {
    const c = await context();
    await expectDbError(
      db.result.update({ where: { id: c.result.id }, data: { version: 0 } }),
      /results_version_check/,
    );
    const foreign = await f.examContext();
    const foreignLine = await f.programSubject(foreign.registration.programId);
    await expectDbError(
      db.resultItem.create({ data: { resultId: c.result.id, programSubjectId: foreignLine.id } }),
      /draft_item_integrity/,
    );
    await db.examination.update({
      where: { id: c.examination.id },
      data: { kind: 'RE_EXAMINATION' },
    });
    await expectDbError(
      db.resultItem.create({ data: { resultId: c.result.id, programSubjectId: c.line.id } }),
      /draft_item_integrity/,
    );
  });
});
