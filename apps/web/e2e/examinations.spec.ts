import { type Browser, type Page, expect, test } from '@playwright/test';
import {
  type Account,
  type StudentAccount,
  capture,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  fixtures,
  signIn,
  studentSignIn,
} from './support';

/**
 * Phase 9 browser tests. Synthetic data only: the curriculum of the e2e year-wise course is built
 * through the real staff API from the signed-in browser session (so every curriculum rule applies);
 * everything a person would do is done through the UI.
 */

const shared = { curriculumId: '', examinationUrl: '' };

async function staffPage(browser: Browser, account: Account, width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await context.newPage();
  await signIn(page, account);
  return page;
}

async function studentPage(browser: Browser, student: StudentAccount, width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await context.newPage();
  await studentSignIn(page, student);
  return page;
}

/** JSON call to the staff API with the session's CSRF token (fixture setup only). */
export async function staffApi(page: Page, method: 'POST' | 'PATCH', path: string, data: object) {
  const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()) as {
    csrfToken: string;
  };
  const response = await page.request.fetch(`/api/v1/${path}`, {
    method,
    data,
    headers: { 'X-CSRF-Token': csrf.csrfToken },
  });
  expect(response.status(), `${method} ${path}: ${await response.text()}`).toBeLessThan(300);
  return (await response.json()) as { id: string };
}

async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByLabel(label).click();
  await page.getByRole('option', { name: option }).click();
}

test.describe.configure({ mode: 'serial' });

test('examination application links and year-wise examination records reach the right students', async ({
  browser,
}) => {
  const { admin, examAdmin, examStudents, examProgram } = fixtures();
  const [alpha, beta] = examStudents;
  if (!alpha || !beta) throw new Error('missing fixtures');

  // Fixture: an ACTIVE year-wise curriculum (2 years, one subject per year) assigned to both students.
  const setup = await staffPage(browser, admin);
  const curriculum = await staffApi(setup, 'POST', `programs/${examProgram.id}/curricula`, {
    versionCode: 'E2E-2026',
    name: 'E2E Synthetic syllabus 2026',
  });
  for (const [period, name] of [
    [1, 'E2E Synthetic Anatomy'],
    [2, 'E2E Synthetic Physiology'],
  ] as const) {
    const subject = await staffApi(setup, 'POST', 'subjects', {
      code: `E2E-SUB-${String(period)}`,
      name,
      category: 'THEORY',
    });
    await staffApi(setup, 'POST', `curricula/${curriculum.id}/subjects`, {
      subjectId: subject.id,
      periodNumber: period,
      classification: 'THEORY',
    });
  }
  await staffApi(setup, 'POST', `curricula/${curriculum.id}/activate`, {});
  await staffApi(setup, 'POST', `curricula/${curriculum.id}/registrations`, {
    registrationIds: [alpha.registrationId, beta.registrationId],
  });
  shared.curriculumId = curriculum.id;
  await setup.context().close();

  // Before anything is configured, the student sees an honest state.
  const portal = await studentPage(browser, alpha);
  await portal.goto('/student/examinations');
  await expect(portal.getByText('Examination application not configured yet')).toBeVisible();

  // EXAM_ADMIN configures the external examination application (https only).
  const staff = await staffPage(browser, examAdmin);
  await staff
    .getByRole('complementary', { name: 'Admin navigation' })
    .getByRole('link', { name: 'Examinations', exact: true })
    .click();
  await expect(staff.getByRole('heading', { level: 1, name: 'Examinations' })).toBeVisible();
  await staff.getByRole('link', { name: 'Examination application' }).click();
  await staff.getByRole('button', { name: 'Add application' }).click();
  const dialog = staff.getByRole('dialog', { name: 'Add examination application' });
  await dialog.getByLabel(/Application name/).fill('E2E Synthetic Exam App');
  await dialog.getByLabel(/Official website URL/).fill('http://exams.example.test');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(
    dialog.getByText('Enter the full https:// address provided by the university.'),
  ).toBeVisible();
  await dialog.getByLabel(/Official website URL/).fill('https://exams.example.test/portal');
  await dialog.getByLabel(/Android download URL/).fill('https://play.example.test/store/apps/e2e');
  await dialog
    .getByLabel(/Instructions for students/)
    .fill('E2E: sign in with your registration number.');
  await dialog.getByLabel('Show to students (active)').check();
  await expectNoSeriousA11yViolations(staff);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(staff.getByText('Active (shown to students)')).toBeVisible();
  await capture(staff, 'examination-application-desktop');

  // EXAM_ADMIN creates a Year 2 examination record and opens it.
  await staff.goto('/admin/examinations');
  await staff.getByRole('button', { name: 'New examination' }).click();
  const create = staff.getByRole('dialog', { name: 'New examination record' });
  await choose(staff, 'Course', /E2E-EXAM-PROG/);
  await choose(staff, 'Curriculum version', /E2E-2026/);
  await choose(staff, 'Semester / year', 'Year 2');
  await choose(staff, 'Academic session', /E2E-SESSION/);
  await create.getByLabel(/^Code/).fill('E2E-EXM-Y2');
  await create.getByLabel(/^Name/).fill('E2E Year 2 Examination');
  await create.getByLabel(/Examination session/).fill('E2E May–June 2026');
  await expectNoSeriousA11yViolations(staff);
  await capture(staff, 'examination-create-desktop');
  await create.getByRole('button', { name: 'Create draft' }).click();
  await expect(staff).toHaveURL(/\/admin\/examinations\/[0-9a-f-]{36}$/);
  await expect(staff.getByText('Year 2').first()).toBeVisible();
  await staff.getByRole('button', { name: 'Open record' }).click();
  await staff.getByRole('dialog').getByRole('button', { name: 'Open record' }).click();
  await expect(staff.getByText('Open (visible to students)').first()).toBeVisible();
  shared.examinationUrl = staff.url();
  await expectNoSeriousA11yViolations(staff);
  await capture(staff, 'examination-detail-desktop');
  await staff.context().close();

  // The student sees the application card and their year-wise record — exams happen elsewhere.
  await portal.reload();
  await expect(portal.getByText(/not in this portal/)).toBeVisible();
  await expect(portal.getByRole('link', { name: /Open the official website/ })).toHaveAttribute(
    'href',
    'https://exams.example.test/portal',
  );
  await expect(portal.getByRole('link', { name: /for Android/ })).toBeVisible();
  await expect(portal.getByRole('link', { name: /iPhone/ })).toHaveCount(0);
  await expect(portal.getByRole('list', { name: 'Course periods' })).toContainText('Year 1');
  await expect(portal.getByText('E2E Year 2 Examination')).toBeVisible();
  await expectNoSeriousA11yViolations(portal);
  await capture(portal, 'student-examinations-desktop');
  await portal.context().close();
});

test('re-exam application: confirmed fee schedule, verified identity, attempt and fee snapshot, staff decision', async ({
  browser,
}) => {
  const { admin, examAdmin, examStudents } = fixtures();
  const [alpha, beta] = examStudents;
  if (!alpha || !beta) throw new Error('missing fixtures');

  // SUPER_ADMIN enters the confirmed schedule (INR 1,000 / 2,500, per subject) and activates it.
  const finance = await staffPage(browser, admin);
  await finance.goto('/admin/re-exam-applications/fees');
  await expect(finance.getByText('No fee rules yet')).toBeVisible();
  await finance.getByRole('button', { name: 'New version' }).click();
  const dialog = finance.getByRole('dialog', { name: 'New fee rule version' });
  await choose(finance, 'Fee is charged', 'Per subject (paper)');
  await dialog.getByLabel(/Attempt 1 amount/).fill('1000');
  await dialog.getByRole('button', { name: 'Add attempt 2' }).click();
  await dialog.getByLabel(/Attempt 2 amount/).fill('2500');
  await expectNoSeriousA11yViolations(finance);
  await dialog.getByRole('button', { name: 'Save draft' }).click();
  await finance.getByRole('button', { name: 'Activate' }).click();
  await finance.getByRole('dialog').getByRole('button', { name: 'Activate' }).click();
  const fees = finance.getByRole('list', { name: 'Fees of version 1' });
  await expect(fees).toContainText('Attempt 1: ₹1,000.00');
  await expect(fees).toContainText('Attempt 2: ₹2,500.00');
  await expect(fees).toContainText('Attempt 3+: no approved fee');
  await capture(finance, 're-exam-fee-rules-desktop');
  await finance.context().close();

  // EXAM_ADMIN opens a Year 1 re-examination for applications (setup through the API).
  const staff = await staffPage(browser, examAdmin);
  const reExam = await staffApi(staff, 'POST', 'examinations', {
    code: 'E2E-REX-Y1',
    name: 'E2E Year 1 Re-examination',
    curriculumId: shared.curriculumId,
    academicSessionId: fixtures().examProgram.sessionId,
    periodNumber: 1,
    kind: 'RE_EXAMINATION',
    examSession: 'E2E Nov 2026',
  });
  await staffApi(staff, 'POST', `examinations/${reExam.id}/open`, {});
  await staffApi(staff, 'POST', `examinations/${reExam.id}/re-exam-applications`, { open: true });

  // The student applies: identity is read-only, attempt and fee come from the server.
  const portal = await studentPage(browser, alpha);
  await portal.goto('/student/examinations');
  await portal.getByRole('link', { name: 'Apply for a re-examination' }).click();
  await expect(
    portal.getByRole('heading', { level: 1, name: 'Apply for a re-examination' }),
  ).toBeVisible();
  const details = portal.getByRole('main');
  await expect(details.getByText('E2E Examinee Alpha')).toBeVisible();
  await expect(details.getByText(alpha.registrationNumber)).toBeVisible();
  await expect(portal.getByRole('textbox')).toHaveCount(0);
  await portal.getByRole('radio', { name: /E2E Year 1 Re-examination/ }).check();
  await expect(portal.getByText(/Re-exam attempt 1 · Fee ₹1,000.00/)).toBeVisible();
  await portal.getByRole('radio', { name: /E2E Synthetic Anatomy/ }).check();
  await expectNoSeriousA11yViolations(portal);
  await capture(portal, 'student-re-exam-apply-desktop');
  await portal.getByRole('button', { name: 'Submit application' }).click();
  await expect(portal).toHaveURL(/\/student\/examinations\/re-exam\/applications$/);
  const card = portal.getByRole('article').first();
  await expect(card).toContainText('Submitted — awaiting decision');
  await expect(card).toContainText('₹1,000.00');
  const reference = (await card.locator('.tabular').first().textContent()) ?? '';
  expect(reference).toMatch(/^RX-/);

  // Another student sees nothing of it.
  const other = await studentPage(browser, beta);
  await other.goto('/student/examinations/re-exam/applications');
  await expect(other.getByText('No re-exam applications yet')).toBeVisible();
  await other.context().close();

  // EXAM_ADMIN finds it by registration number and approves it.
  await staff.goto('/admin/re-exam-applications');
  await staff
    .getByLabel('Search by student name or registration number')
    .fill(alpha.registrationNumber);
  await staff.getByRole('link', { name: reference }).first().click();
  await expect(staff.getByRole('heading', { level: 1, name: 'E2E Examinee Alpha' })).toBeVisible();
  await expect(staff.getByText('₹1,000.00 · Per subject (paper)')).toBeVisible();
  await expectNoSeriousA11yViolations(staff);
  await capture(staff, 're-exam-application-detail-desktop');
  await staff.getByRole('button', { name: 'Approve' }).click();
  await staff.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await expect(staff.getByText('Approved').first()).toBeVisible();
  await staff.goto('/admin/re-exam-applications');
  await capture(staff, 're-exam-applications-desktop');
  await staff.context().close();

  await portal.reload();
  await expect(portal.getByRole('article').first()).toContainText('Approved by the university');
  await expectNoSeriousA11yViolations(portal);
  await capture(portal, 'student-re-exam-applications-desktop');
  await portal.context().close();
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('examination screens work at 390px', async ({ browser }) => {
    const { examAdmin, examStudents } = fixtures();
    const [alpha] = examStudents;
    if (!alpha) throw new Error('missing fixture');
    const staff = await staffPage(browser, examAdmin, 390);
    for (const [name, url] of [
      ['examinations-list-mobile', '/admin/examinations'],
      ['examination-detail-mobile', shared.examinationUrl],
      ['examination-application-mobile', '/admin/examinations/application'],
      ['re-exam-applications-mobile', '/admin/re-exam-applications'],
    ] as const) {
      await staff.goto(url);
      await expect(staff.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(staff);
      await expectNoSeriousA11yViolations(staff);
      await capture(staff, name);
    }
    await staff.context().close();
    const portal = await studentPage(browser, alpha, 390);
    await portal.goto('/student/examinations');
    await expect(portal.getByRole('heading', { level: 1, name: 'Examinations' })).toBeVisible();
    await expectNoHorizontalOverflow(portal);
    await expectNoSeriousA11yViolations(portal);
    await capture(portal, 'student-examinations-mobile');
    for (const [name, url] of [
      ['student-re-exam-apply-mobile', '/student/examinations/re-exam'],
      ['student-re-exam-applications-mobile', '/student/examinations/re-exam/applications'],
    ] as const) {
      await portal.goto(url);
      await expect(portal.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(portal);
      await expectNoSeriousA11yViolations(portal);
      await capture(portal, name);
    }
    await portal.context().close();
  });
});
