import { type Browser, type Page, expect, test } from '@playwright/test';
import {
  capture,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  fixtures,
  openSection,
  signIn,
  studentSignIn,
  syntheticPng,
} from './support';

const DOB = '2001-04-05';

async function staffPage(browser: Browser, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await signIn(page, fixtures().registrar);
  return page;
}

async function openRequest(page: Page, studentName: string) {
  await openSection(page, 'Profile Requests');
  await page.getByLabel('Search requests').fill(studentName);
  // The search applies (debounced) to the URL; wait so it cannot replace the next navigation.
  await expect(page).toHaveURL(/search=/);
  await page.getByRole('link', { name: `Review request from ${studentName}` }).click();
  await expect(page.getByRole('heading', { level: 1, name: studentName })).toBeVisible();
}

test('a student submits a missing DOB and photo; a registrar approves; the profile updates', async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const student = fixtures().profileStudents[0];
  if (!student) throw new Error('missing fixture');
  await studentSignIn(page, student);

  await page.goto('/student/profile');
  await expect(page.getByRole('heading', { name: 'Update my details' })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await capture(page, 'student-profile-form-desktop');

  // An invalid image is refused by the server's content check (the browser only checks the type).
  await page.getByLabel('Date of birth').fill(DOB);
  await page.getByLabel('Photo').setInputFiles({
    name: 'not-a-photo.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('this is not an image'),
  });
  await page.getByRole('button', { name: 'Review changes' }).click();
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText('The file is not a readable image.').first()).toBeVisible();

  // A real (synthetic) image: preview, then submit for approval.
  await page.getByLabel('Photo').setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: await syntheticPng(page),
  });
  await page.getByRole('button', { name: 'Review changes' }).click();
  const review = page.getByRole('table', { name: 'Proposed changes' });
  await expect(review.getByRole('rowheader', { name: 'Date of birth' })).toBeVisible();
  await expect(review).toContainText('05 Apr 2001');
  await expect(page.getByRole('img', { name: `${student.studentName}, proposed` })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await capture(page, 'student-profile-review-desktop');
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page).toHaveURL(/\/student\/profile\/requests\?submitted=1$/);
  await expect(page.getByRole('status')).toContainText('Request submitted for approval');

  // One pending request at a time: the profile shows the pending request instead of a new form.
  await page.goto('/student/profile');
  await expect(page.getByText('Pending review').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review changes' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Request history' }).click();
  await expect(page).toHaveURL(/\/student\/profile\/requests$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Profile update requests' }),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: 'Photo submitted with this request' })).toBeVisible();
  // "My Profile" stays the active section on the sub-page.
  await expect(
    page.getByRole('navigation', { name: 'Student', exact: true }).locator('[aria-current="page"]'),
  ).toHaveText(/My Profile/);
  await expectNoSeriousA11yViolations(page);
  await capture(page, 'student-profile-requests-pending-desktop');

  // The registrar compares and approves.
  const staff = await staffPage(browser);
  await openSection(staff, 'Profile Requests');
  await expect(
    staff.getByRole('row').filter({ hasText: student.registrationNumber }),
  ).toContainText('Pending review');
  await capture(staff, 'admin-profile-requests-desktop');
  await expectNoSeriousA11yViolations(staff);
  await openRequest(staff, student.studentName);
  const comparison = staff.getByRole('table', {
    name: 'Requested changes compared with the official record',
  });
  await expect(comparison).toContainText('05 Apr 2001');
  await expect(staff.getByRole('img', { name: 'Proposed photo' })).toBeVisible();
  await expect(staff.getByText('No official photo')).toBeVisible();
  await expectNoSeriousA11yViolations(staff);
  await capture(staff, 'admin-profile-request-detail-desktop');
  await staff.getByRole('button', { name: 'Approve' }).click();
  await staff.getByRole('button', { name: 'Approve and update record' }).click();
  await expect(staff.getByText('Approved').first()).toBeVisible();
  await expect(staff.getByText('Approved; official record updated')).toBeVisible();
  await expect(staff.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await staff.context().close();

  // The student's official profile now shows the approved values and photo.
  await page.goto('/student/profile');
  await expect(page.getByText('05 Apr 2001').first()).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Student identity' }).getByRole('img', {
      name: `Photo of ${student.studentName}`,
    }),
  ).toBeVisible();
  await expect(page.getByText('Official photo on record.')).toBeVisible();
  await page.goto('/student');
  await expect(
    page.getByRole('list', { name: 'Recent activity' }).getByText('Profile update approved'),
  ).toBeVisible();
  await capture(page, 'student-home-after-approval-desktop');
  await page.goto('/student/profile/requests');
  await expect(page.getByText('Your official profile has been updated.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a registrar rejects with a reason; the student sees it and can cancel a new request', async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const student = fixtures().profileStudents[1];
  if (!student) throw new Error('missing fixture');
  await studentSignIn(page, student);
  await page.goto('/student/profile');
  await page.getByLabel('Full name').fill('Review Student Corrected');
  await page.getByLabel("Mother's name").fill('Synthetic Mother');
  await page.getByLabel('Note for the registrar (optional)').fill('As on my admission letter.');
  await page.getByRole('button', { name: 'Review changes' }).click();
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByRole('status')).toContainText('Request submitted for approval');

  const staff = await staffPage(browser);
  await openRequest(staff, student.studentName);
  await expect(staff.getByText('As on my admission letter.')).toBeVisible();
  await staff.getByRole('button', { name: 'Reject' }).click();
  const dialog = staff.getByRole('dialog', { name: 'Reject this request' });
  await expect(dialog.getByRole('button', { name: 'Reject request' })).toBeDisabled();
  await dialog
    .getByLabel('Reason (shown to the student)')
    .fill('The name must match your admission documents.');
  await dialog.getByRole('button', { name: 'Reject request' }).click();
  await expect(staff.getByText('The name must match your admission documents.')).toBeVisible();
  await staff.context().close();

  await page.goto('/student/profile/requests');
  const rejected = page.getByRole('article').filter({ hasText: 'Rejected' });
  await expect(rejected).toContainText('The name must match your admission documents.');
  await page.goto('/student/profile');
  // The official record is unchanged.
  await expect(page.getByRole('heading', { name: student.studentName })).toBeVisible();

  // A new request can be cancelled by the student.
  await page.getByLabel('Gender').selectOption('Other');
  await page.getByRole('button', { name: 'Review changes' }).click();
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByRole('status')).toContainText('Request submitted for approval');
  await page.getByRole('button', { name: 'Cancel request' }).click();
  await page
    .getByRole('dialog', { name: 'Cancel this request?' })
    .getByRole('button', { name: 'Cancel request' })
    .click();
  await expect(page.getByRole('article').filter({ hasText: 'Cancelled' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel request' })).toHaveCount(0);
  await capture(page, 'student-profile-requests-history-desktop');
  await expectNoSeriousA11yViolations(page);
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('profile form, request history and staff review work at 390px', async ({
    page,
    browser,
  }) => {
    const student = fixtures().profileStudents[1];
    if (!student) throw new Error('missing fixture');
    await studentSignIn(page, student);
    await page.goto('/student/profile');
    await expect(page.getByRole('button', { name: 'Review changes' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(page, 'student-profile-form-mobile');
    // Submit from the phone layout: edit → review → submit.
    await page.getByLabel('Gender').selectOption('Male');
    await page.getByRole('button', { name: 'Review changes' }).click();
    await expect(page.getByRole('table', { name: 'Proposed changes' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(page, 'student-profile-review-mobile');
    await page.getByRole('button', { name: 'Submit for approval' }).click();
    await expect(page.getByRole('status')).toContainText('Request submitted for approval');
    await expect(page.getByRole('article').filter({ hasText: 'Pending review' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(page, 'student-profile-requests-mobile');

    const staff = await staffPage(browser, { width: 390, height: 844 });
    await staff.goto('/admin/profile-requests');
    await expect(staff.getByRole('heading', { level: 1, name: 'Profile requests' })).toBeVisible();
    await expectNoHorizontalOverflow(staff);
    await capture(staff, 'admin-profile-requests-mobile');
    await staff.getByRole('link', { name: student.studentName }).first().click();
    await expect(staff.getByRole('heading', { level: 1, name: student.studentName })).toBeVisible();
    await expectNoHorizontalOverflow(staff);
    await capture(staff, 'admin-profile-request-detail-mobile');
    await staff.context().close();
  });
});
