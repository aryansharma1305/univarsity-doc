import { type Page, expect, test } from '@playwright/test';
import {
  capture,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  fixtures,
  openSection,
  signIn,
} from './support';

const PASSWORD = 'e2e student passphrase for testing';

/** Registrar issues a fresh activation code for the fixture registration and returns it. */
async function issueCode(page: Page): Promise<string> {
  const { registrar, fixture } = fixtures();
  await signIn(page, registrar);
  await openSection(page, 'Student Accounts');
  await page.getByLabel('Search student accounts').fill(fixture.registrationNumber);
  const row = page.getByRole('row').filter({ hasText: fixture.registrationNumber });
  await expect(row).toBeVisible();
  await capture(page, 'student-accounts-desktop');
  await expectNoSeriousA11yViolations(page);
  await row.getByRole('button', { name: `Actions for ${fixture.registrationNumber}` }).click();
  await page.getByRole('menuitem', { name: /Issue (activation|new|recovery) code/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Activation codes' });
  await expect(dialog).toContainText('Shown once');
  const code = (await dialog.locator('td.font-mono').first().textContent())?.trim() ?? '';
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  await capture(page, 'student-accounts-codes-desktop');
  await dialog.getByRole('button', { name: 'Close' }).first().click();
  // Staff sign out before the student uses the browser.
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
  return code;
}

test('a student activates with a university code, sees only their own record, signs out and back in', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  const { fixture } = fixtures();
  const code = await issueCode(page);

  await page.goto('/student/register');
  await expect(page.getByRole('heading', { name: 'Activate your account' })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await capture(page, 'student-register-desktop');

  // A wrong code gets the generic answer and nothing else.
  await page.getByLabel('Registration number').fill(fixture.registrationNumber);
  await page.getByLabel('Activation code').fill('ZZZZ-ZZZZ-ZZZZ');
  await page.getByLabel('New password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm new password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Activate account' }).click();
  await expect(page.locator('form').getByRole('alert')).toContainText(
    'not valid, or the code has expired',
  );

  // The deliberate invalid-code response above is a 400; monitor console errors on the valid flow.
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });

  await page.getByLabel('Activation code').fill(code.toLowerCase());
  await page.getByRole('button', { name: 'Activate account' }).click();
  await expect(page).toHaveURL(/\/student$/);
  await expect(
    page.getByRole('heading', { name: `Welcome, ${fixture.studentName}` }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: fixture.registrationNumber })).toBeVisible();
  await expect(page.getByText('Not on record').first()).toBeVisible();
  // Recent activity shows only the real activation event; planned modules are marked "Soon".
  await expect(
    page.getByRole('list', { name: 'Recent activity' }).getByText('Student account activated'),
  ).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Quick actions' })
      .getByRole('link', { name: /My Results.*Soon/ }),
  ).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await capture(page, 'student-home-desktop');

  for (const [label, route, heading] of [
    ['My Profile', '/student/profile', 'My Profile'],
    ['Course Details', '/student/course', 'Course Details'],
    ['Examinations & Results', '/student/results', 'Examinations & Results'],
    ['My Documents', '/student/documents', 'My Documents'],
    ['Notifications', '/student/notifications', 'Notifications'],
    ['Account Settings', '/student/settings', 'Account Settings'],
  ]) {
    await page
      .getByRole('navigation', { name: 'Student', exact: true })
      .getByRole('link', { name: new RegExp(`^${label}`) })
      .click();
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Student', exact: true })
        .locator('[aria-current="page"]'),
    ).toHaveCount(1);
    await expectNoSeriousA11yViolations(page);
    await expectNoHorizontalOverflow(page);
    if (route === '/student/profile') {
      await expect(page.getByText('Official records are read-only')).toBeVisible();
      await expect(page.getByRole('button', { name: /Edit/ })).toHaveCount(0);
    }
    if (['/student/results', '/student/notifications'].includes(route ?? '')) {
      await expect(page.getByText(/are not available yet/)).toBeVisible();
      await expect(page.locator('main input, main form')).toHaveCount(0);
    }
    if (route === '/student/documents') {
      // Phase 8: a real library; this student has nothing published, and students never upload.
      await expect(page.getByText('No documents published yet')).toBeVisible();
      await expect(page.locator('main input, main form')).toHaveCount(0);
    }
    await capture(page, `student-${route?.split('/').at(-1)}-desktop`);
  }
  expect(browserErrors).toEqual([]);

  // The student session is not a staff session.
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);

  await page.goto('/student');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/student\/login/);
  for (const route of [
    '/student/profile',
    '/student/course',
    '/student/results',
    '/student/documents',
    '/student/notifications',
    '/student/settings',
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/student\/login/);
  }
  await page.goto('/student');
  await expect(page).toHaveURL(/\/student\/login/);

  await page.getByLabel('Registration number').fill(fixture.registrationNumber);
  await page.getByLabel('Password').fill('not the right password at all');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('form').getByRole('alert')).toContainText(
    'incorrect, or the account has not been activated',
  );
  await capture(page, 'student-login-desktop');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByRole('heading', { name: fixture.registrationNumber })).toBeVisible();
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('student portal and student accounts work at 390px', async ({ page }) => {
    const { registrar, fixture } = fixtures();
    await page.goto('/student/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(page, 'student-login-mobile');
    await page.getByLabel('Registration number').fill(fixture.registrationNumber);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/student$/);
    await expectNoHorizontalOverflow(page);
    await capture(page, 'student-home-mobile');
    await page.getByRole('button', { name: 'Open student navigation' }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await drawer.getByRole('link', { name: 'My Profile' }).click();
    await expect(drawer).not.toBeVisible();
    await expect(page).toHaveURL(/\/student\/profile$/);
    await expectNoHorizontalOverflow(page);
    await capture(page, 'student-profile-mobile');
    await page.getByRole('button', { name: 'Open student navigation' }).click();
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Open student navigation' })).toBeFocused();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/student\/login/);

    await signIn(page, registrar);
    await page.goto('/admin/student-accounts');
    await expect(page.getByRole('heading', { level: 1, name: 'Student accounts' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Student accounts' })).toContainText(
      fixture.registrationNumber,
    );
    await expectNoHorizontalOverflow(page);
    await capture(page, 'student-accounts-mobile');
  });
});
