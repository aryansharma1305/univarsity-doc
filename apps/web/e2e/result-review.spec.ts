import { expect, test, type Page } from '@playwright/test';
import {
  fixtures,
  signIn,
  uniqueCode,
  capture,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
} from './support';
async function post(page: Page, path: string, data: object) {
  const { csrfToken } = (await (await page.request.get('/api/v1/auth/csrf')).json()) as {
    csrfToken: string;
  };
  const response = await page.request.post(`/api/v1/${path}`, {
    data,
    headers: { 'X-CSRF-Token': csrfToken },
  });
  expect(response.status(), await response.text()).toBeLessThan(300);
  return (await response.json()) as {
    id: string;
    resultId?: string;
    registrations?: { id: string }[];
  };
}
for (const structure of ['SEMESTER_WISE', 'YEAR_WISE'] as const) {
  test(`${structure}: reviewed marks version and fail-closed publication`, async ({ page }) => {
    test.setTimeout(120000);
    const f = fixtures();
    await signIn(page, f.admin);
    const courseCode = uniqueCode('RVC'),
      subjectCode = uniqueCode('RVS'),
      examCode = uniqueCode('RVE');
    const course = await post(page, 'programs', {
      code: courseCode,
      name: 'Synthetic review results course',
      level: 'CERTIFICATE',
      durationValue: 1,
      durationUnit: 'YEARS',
      academicStructure: structure,
      periodCount: structure === 'SEMESTER_WISE' ? 2 : 1,
    });
    const curriculum = await post(page, `programs/${course.id}/curricula`, {
      versionCode: uniqueCode('RVV'),
      name: 'Synthetic review curriculum',
    });
    const subject = await post(page, 'subjects', {
      code: subjectCode,
      name: 'Synthetic assessed subject',
      category: 'THEORY',
    });
    await post(page, `curricula/${curriculum.id}/subjects`, {
      subjectId: subject.id,
      periodNumber: 1,
      classification: 'THEORY',
      maxMarks: 100,
      components: [
        { name: 'Internal', maxMarks: 30 },
        { name: 'External', maxMarks: 70 },
      ],
    });
    await post(page, `curricula/${curriculum.id}/activate`, {});
    const registration = `00${uniqueCode('RV')}`;
    const student = await post(page, 'students', {
      student: { fullName: 'Synthetic review learner' },
      registration: {
        registrationNumber: registration,
        programId: course.id,
        academicSessionId: f.examProgram.sessionId,
      },
    });
    const registrationId = student.registrations?.[0]?.id;
    if (!registrationId) throw new Error('Synthetic registration missing');
    await post(page, `curricula/${curriculum.id}/registrations`, {
      registrationIds: [registrationId],
    });
    const exam = await post(page, 'examinations', {
      code: examCode,
      name: 'Synthetic review examination',
      curriculumId: curriculum.id,
      academicSessionId: f.examProgram.sessionId,
      periodNumber: 1,
      kind: 'REGULAR',
      examSession: 'Synthetic October 2026',
    });
    await post(page, `examinations/${exam.id}/open`, {});

    const curriculumDetail = (await (
      await page.request.get(`/api/v1/curricula/${curriculum.id}`)
    ).json()) as { periods: { subjects: { id: string }[] }[] };
    const lineId = curriculumDetail.periods[0]?.subjects[0]?.id;
    if (!lineId) throw Error('Synthetic subject assignment missing');
    const draft = await post(page, 'draft-results', {
      context: {
        programId: course.id,
        curriculumId: curriculum.id,
        academicSessionId: f.examProgram.sessionId,
        periodNumber: 1,
        examinationId: exam.id,
      },
      registrationId,
      programSubjectId: lineId,
      reExamApplicationId: null,
      expectedVersion: null,
      marks: {
        internalMarks: '0',
        externalMarks: '60',
        practicalMarks: null,
        otherMarks: null,
        totalMarks: null,
      },
    });
    if (!draft.resultId) throw Error('Synthetic result missing');
    await page.goto(`/admin/results/review/${draft.resultId}`);
    await expect(page.getByRole('heading', { name: 'Review result marks' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit for review' })).toBeDisabled();
    await page
      .getByLabel('I have reviewed the marks and context for version 1 and confirm this action.')
      .check();
    await page.getByRole('button', { name: 'Submit for review' }).click();
    await expect(
      page.getByText('UNDER REVIEW · Attempt 1 · Revision 1 · Version 2', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Publication configuration required' }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await expectNoHorizontalOverflow(page);
    await capture(page, `review-${structure.toLowerCase()}-desktop`);
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoSeriousA11yViolations(page);
    await expectNoHorizontalOverflow(page);
    await capture(page, `review-${structure.toLowerCase()}-mobile`);
    await page.getByRole('button', { name: 'View marks from version 2' }).click();
    await expect(page.getByRole('heading', { name: 'Saved marks version 2' })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Saved marks version' }).getByText('60', { exact: true }),
    ).toBeVisible();
    await page.goto('/admin/results/review');
    await expect(page.getByRole('heading', { name: 'Result review', exact: true })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await expectNoHorizontalOverflow(page);
    await capture(page, `review-queue-${structure.toLowerCase()}-mobile`);
  });
}
