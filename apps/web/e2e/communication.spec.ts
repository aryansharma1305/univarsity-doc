import { expect, test } from '@playwright/test';
import {
  capture,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  fixtures,
  signIn,
  studentSignIn,
} from './support';

test('student message → staff reply → student notification, accessible on mobile', async ({
  browser,
  page,
}) => {
  test.setTimeout(120_000);
  const student = fixtures().eligibilityStudent;
  const subject = `Synthetic E2E question ${String(Date.now())}`;
  await studentSignIn(page, student);
  await page.goto('/student/messages');
  await expect(page.getByRole('heading', { level: 1, name: 'Messages' })).toBeVisible();
  await page.getByLabel('Subject', { exact: true }).fill(subject);
  await page.getByLabel('Message', { exact: true }).fill('When will my transcript be ready?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page).toHaveURL(/\/student\/messages\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('list', { name: 'Messages' })).toContainText(
    'When will my transcript',
  );

  const staff = await browser.newContext();
  const staffPage = await staff.newPage();
  await signIn(staffPage, fixtures().registrar);
  await staffPage.goto('/admin/messages');
  await staffPage.getByRole('link', { name: subject }).click();
  await expect(staffPage.getByRole('list', { name: 'Messages' })).toContainText(
    'When will my transcript',
  );
  await staffPage.getByLabel('Your reply', { exact: true }).fill('It will be ready next week.');
  await staffPage.getByRole('button', { name: 'Send reply' }).click();
  await expect(staffPage.getByRole('list', { name: 'Messages' })).toContainText('next week');
  await expectNoSeriousA11yViolations(staffPage);
  await capture(staffPage, 'communication-staff-thread');
  await staff.close();

  await page.goto('/student/notifications');
  await expect(page.getByText('New reply from the university').first()).toBeVisible();
  await page.getByRole('link', { name: 'Open' }).first().click();
  const messages = page.getByRole('list', { name: 'Messages' });
  await expect(messages).toContainText('It will be ready next week.');
  await expect(messages).toContainText('University administration');
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
  await capture(page, 'communication-student-thread-mobile');
});

test('public verification support: submit, keep the access code, staff see the query', async ({
  browser,
  page,
}) => {
  await page.goto('/verify/support');
  await expect(page.getByRole('heading', { level: 1, name: 'Verification support' })).toBeVisible();
  await page.getByLabel('Your name', { exact: true }).fill('Synthetic E2E Employer');
  await page.getByLabel('Your question', { exact: true }).fill('How can we verify a transcript?');
  await page.getByRole('button', { name: 'Submit query' }).click();
  const receipt = page.getByRole('status').filter({ hasText: 'Query submitted' });
  await expect(receipt).toBeVisible();
  const reference = (await receipt.locator('dd').first().textContent()) ?? '';
  expect(reference).toMatch(/^VQ-[0-9A-HJKMNP-TV-Z]{8}$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
  await capture(page, 'communication-public-support-mobile');

  const staff = await browser.newContext();
  const staffPage = await staff.newPage();
  await signIn(staffPage, fixtures().registrar);
  await staffPage.goto(`/admin/verification-queries?search=${reference}`);
  await staffPage.getByRole('link', { name: new RegExp(reference) }).click();
  await expect(staffPage.getByText('Synthetic E2E Employer')).toBeVisible();
  await expectNoSeriousA11yViolations(staffPage);
  await staff.close();
});
