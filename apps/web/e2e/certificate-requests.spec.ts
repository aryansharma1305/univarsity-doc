import { test, expect } from '@playwright/test';
import {
  fixtures,
  studentSignIn,
  signIn,
  capture,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
} from './support';
test('student catalogue and owned history fit all viewports with disabled policies and reduced motion', async ({
  page,
}) => {
  test.setTimeout(120000);
  const s = fixtures().profileStudents[0];
  if (!s) throw new Error('Missing student');
  await studentSignIn(page, s);
  await page.goto('/student/certificate-requests');
  for (const [width, height, label] of [
    [1440, 1000, 'desktop'],
    [768, 1024, 'tablet'],
    [390, 844, 'mobile'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(
      page.getByRole('heading', { name: 'Certificate Requests', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Not available yet' })).toHaveCount(5);
    await expect(page.getByRole('button', { name: 'Not available yet' }).first()).toBeDisabled();
    await expect(page.getByText('CR-E2E-SYNTHETIC-APPLICATION')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page);
    await capture(page, `phase12b-student-${label}`);
    if (width < 1024)
      await page.screenshot({
        path: `test-results/screenshots/phase12b-student-${label}-viewport.png`,
      });
  }
  const navigation = page.getByRole('button', { name: 'Open student navigation' });
  await navigation.click();
  await expect(
    page.getByRole('dialog').getByRole('link', { name: 'Certificate Requests', exact: true }),
  ).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await page.screenshot({ path: 'test-results/screenshots/phase12b-student-drawer.png' });
  await page.keyboard.press('Escape');
  await expect(navigation).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/student/certificate-requests/${fixtures().certificateRequestId}`);
  await expect(page.getByRole('heading', { name: 'Application history' })).toBeVisible();
  await expect(page.getByText('Application submitted')).toBeVisible();
  await expect(page.getByText('Private staff note')).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
  await capture(page, 'phase12b-student-detail-reduced-motion');
  await page.getByRole('link', { name: 'Back to certificate requests' }).focus();
  await expect(page.getByRole('link', { name: 'Back to certificate requests' })).toBeFocused();
  const other = fixtures().profileStudents[1];
  if (!other) throw new Error('Missing second student');
  await page.context().clearCookies();
  await studentSignIn(page, other);
  await page.goto('/student/certificate-requests');
  await expect(page.getByText('No applications yet')).toBeVisible();
  await expect(page.getByText('CR-E2E-SYNTHETIC-APPLICATION')).toHaveCount(0);
});
test('staff queue filters, private review and information dialog preserve ownership and accessibility', async ({
  page,
}) => {
  test.setTimeout(120000);
  await signIn(page, fixtures().admin);
  await page.goto('/admin/certificate-requests');
  await expect(page.getByText('CR-E2E-SYNTHETIC-APPLICATION')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expectNoSeriousA11yViolations(page);
  await capture(page, 'phase12b-staff-queue');
  for (const [width, height, label] of [
    [768, 1024, 'tablet'],
    [390, 844, 'mobile'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page);
    await capture(page, `phase12b-staff-queue-${label}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel('Search requests').fill('DOES-NOT-EXIST');
  await expect(page.getByText('No matching requests')).toBeVisible();
  await page.getByLabel('Search requests').fill('CR-E2E');
  await expect(page.getByText('CR-E2E-SYNTHETIC-APPLICATION')).toBeVisible();
  await page.goto(`/admin/certificate-requests/${fixtures().certificateRequestId}`);
  await expect(page.getByRole('button', { name: 'Request information' })).toBeVisible();
  await capture(page, 'phase12b-staff-detail');
  await page.getByRole('button', { name: 'Request information' }).click();
  await page
    .getByLabel('Information requested (visible to student)')
    .fill('Please clarify the purpose of this synthetic request.');
  await page.getByLabel('Private staff note (optional)').fill('PRIVATE SYNTHETIC REVIEW');
  await expectNoSeriousA11yViolations(page);
  await capture(page, 'phase12b-information-dialog');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Request information' })).toBeFocused();
  await page.getByRole('button', { name: 'Request information' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Request information', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText('Additional information requested')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Complete staff review' })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await capture(page, 'phase12b-staff-detail-mobile');
  const s = fixtures().profileStudents[0];
  if (!s) throw new Error('Missing student');
  await page.context().clearCookies();
  await studentSignIn(page, s);
  await page.goto(`/student/certificate-requests/${fixtures().certificateRequestId}`);
  await expect(
    page.getByText('Please clarify the purpose of this synthetic request.'),
  ).toBeVisible();
  await expect(page.getByText('PRIVATE SYNTHETIC REVIEW')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Provide information' })).toHaveCount(0);
  await capture(page, 'phase12b-student-information-policy-disabled');
  await page.evaluate(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
  });
  await page.screenshot({
    path: 'test-results/screenshots/phase12b-student-information-viewport.png',
  });
});
test('unauthorized staff have no queue access or navigation', async ({ page }) => {
  await signIn(page, fixtures().viewer);
  await page.goto('/admin/certificate-requests');
  await expect(page.getByRole('heading', { name: 'You don’t have access to this' })).toBeVisible();
  await expect(page.locator('a[href="/admin/certificate-requests"]')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(
    page.getByRole('dialog').getByRole('link', { name: 'Certificate Requests', exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expectNoSeriousA11yViolations(page);
  await capture(page, 'phase12b-forbidden');
});
