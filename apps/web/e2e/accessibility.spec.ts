import { test } from '@playwright/test';

// Check colours at their final state: with reduced motion the entrance animations are skipped
// (which also exercises the reduced-motion path).
test.use({ colorScheme: 'light' });
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});
import { expectNoSeriousA11yViolations, fixtures, signIn } from './support';

test('public pages have no serious accessibility violations', async ({ page }) => {
  for (const path of ['/', '/results', '/admin/login']) {
    await page.goto(path);
    await expectNoSeriousA11yViolations(page);
  }
});

test('admin pages have no serious accessibility violations', async ({ page }) => {
  const { admin, fixture } = fixtures();
  await signIn(page, admin);
  for (const path of [
    '/admin',
    '/admin/students',
    '/admin/students/new',
    `/admin/students/${fixture.studentId}`,
    '/admin/programs',
    '/admin/subjects',
    '/admin/departments',
    '/admin/academic-sessions',
  ]) {
    await page.goto(path);
    await page
      .locator('[aria-busy="true"]')
      .first()
      .waitFor({ state: 'detached' })
      .catch(() => undefined);
    await expectNoSeriousA11yViolations(page);
  }
});
