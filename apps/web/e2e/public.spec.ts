import { expect, test } from '@playwright/test';
import { capture, expectNoHorizontalOverflow, expectNoSeriousA11yViolations } from './support';

const NAVIGATION = [
  ['Verify Admission Letter', '/verify/admission-letter'],
  ['Verify Certificate', '/verify/certificate'],
  ['Verify Registration', '/verify/registration'],
  ['Check Result', '/results'],
  ['Student Sign in', '/student/login'],
] as const;
const VERIFICATION = [
  [
    '/verify/admission-letter',
    'Verify Admission Letter',
    'Enter admission letter number',
    'Verify Admission Letter',
  ],
  [
    '/verify/certificate',
    'Verify Certificate',
    'Enter the code printed on the certificate',
    'Verify Certificate',
  ],
  [
    '/verify/registration',
    'Verify Registration',
    'Enter registration number',
    'Verify Registration',
  ],
  // Check Result: course + roll number + semester; signed-in students use the disclosure below.
  ['/results', 'Check Result', 'Your registration number', 'Show my results'],
] as const;

for (const width of [1440, 768, 390, 320]) {
  test(`verification pages and navigation remain accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const requests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/v1/')) requests.push(request.url());
    });
    await page.route('**/api/v1/student-auth/csrf', (route) =>
      route.fulfill({ json: { csrfToken: 'synthetic-csrf' } }),
    );
    await page.route('**/api/v1/public/verify/*', async (route) => {
      expect(route.request().method()).toBe('POST');
      if (route.request().url().endsWith('/result-options')) {
        await route.fulfill({ json: { programs: [] } });
        return;
      }
      expect(route.request().postDataJSON()).toEqual({
        contractVersion: 2,
        reference: 'SYNTHETIC-REFERENCE',
      });
      const service = new URL(route.request().url()).pathname.split('/').at(-1);
      await route.fulfill({
        json: {
          contractVersion: 2,
          service,
          status: 'UNAVAILABLE',
          message: 'Verification is not available yet. No record has been checked.',
        },
      });
    });
    for (const [path, title, placeholder, action] of VERIFICATION) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
      if (path === '/results') {
        await expect(page.getByLabel('Course Name', { exact: true })).toBeVisible();
        await expect(page.getByLabel('Roll Number', { exact: true })).toBeVisible();
        await expect(page.getByLabel('Semester', { exact: true })).toBeVisible();
        await page.getByText('Student? See your own published marks after signing in').click();
      }
      const input = page.getByPlaceholder(placeholder);
      const button = page.getByRole('button', { name: action, exact: true });
      await expect(input).toBeVisible();
      await expect(input).toHaveAttribute('placeholder', placeholder);
      await button.click();
      await expect(input).toBeFocused();
      await expect(page.getByRole('status')).not.toContainText('No record has been checked');
      await input.fill('SYNTHETIC-REFERENCE');
      await input.press('Enter');
      await expect(page.getByRole('status')).toContainText('No record has been checked');
      await expect(page).toHaveURL(path);
      await expect(page.getByRole('contentinfo')).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Docversity home' })).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
      await expectNoSeriousA11yViolations(page);
      await capture(page, `mentor-${path.replaceAll('/', '-')}-${width}`);
    }
    if (width < 1280) await page.getByRole('button', { name: 'Open menu' }).click();
    const nav = page.getByRole('navigation', {
      name: width < 1280 ? 'Mobile' : 'Main',
      exact: true,
    });
    await expect(nav.getByRole('link')).toHaveText(NAVIGATION.map(([label]) => label));
    for (const [label, href] of NAVIGATION)
      await expect(nav.getByRole('link', { name: label, exact: true })).toHaveAttribute(
        'href',
        href,
      );
    await expectNoSeriousA11yViolations(page);
    if (width < 1280) {
      await nav.getByRole('link', { name: 'Verify Certificate', exact: true }).click();
      await expect(page).toHaveURL('/verify/certificate');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    expect(
      requests.filter(
        (url) =>
          new URL(url).pathname.startsWith('/api/v1/public/verify/') &&
          !url.endsWith('/result-options'),
      ),
    ).toHaveLength(4);
  });

  test(`homepage is the animated hero, not a verification form, at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toHaveText(/Verify\.\s*Trust\.\s*Confirm\./);
    await expect(page.getByRole('img', { name: 'Docversity University' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Activate your account', exact: true }),
    ).toHaveAttribute('href', '/student/register');
    await expect(page.getByRole('heading', { name: 'Verify Admission Letter' })).toHaveCount(0);
    await expect(page.getByPlaceholder('Enter admission letter number')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Verify', exact: true })).toHaveCount(0);
    const search = page.getByRole('search', { name: 'Verify a record' });
    await expect(search.locator('select, input, button')).toHaveCount(3);
    await expect(search.locator('select, input, button').nth(0)).toHaveAccessibleName('Service');
    await expect(search.locator('select, input, button').nth(1)).toHaveAttribute(
      'placeholder',
      'Enter your registration number',
    );
    await expect(search.locator('select, input, button').nth(2)).toHaveText('Search');
    await expect(page.getByText(/Single-use activation codes|Only your own records/)).toHaveCount(
      0,
    );
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page);
    await capture(page, `homepage-${width}`);
  });
}

test('keyboard focus, enlarged text and mobile drawer remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const first = page
    .getByRole('navigation', { name: 'Main', exact: true })
    .getByRole('link')
    .first();
  await first.focus();
  const outline = await first.evaluate((el) => ({
    width: parseFloat(getComputedStyle(el).outlineWidth),
    style: getComputedStyle(el).outlineStyle,
  }));
  expect(outline.width).toBeGreaterThanOrEqual(2);
  expect(outline.style).not.toBe('none');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await expect(page.getByRole('navigation', { name: 'Main', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('navigation', { name: 'Mobile' }).getByRole('link')).toHaveText(
    NAVIGATION.map(([label]) => label),
  );
  await expectNoHorizontalOverflow(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
  await page.setViewportSize({ width: 320, height: 900 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(1);
  await expectNoSeriousA11yViolations(page);
});

for (const width of [1440, 390, 320]) {
  test(`student login retains its form and centered animated crest at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/student/login');
    const visual = page.getByRole('complementary');
    await expect(visual).toHaveText('Welcome to Verification Portal');
    const crest = visual.locator('img');
    await expect(crest).toBeVisible();
    const box = await crest.boundingBox();
    const panel = await visual.boundingBox();
    expect(box).toBeTruthy();
    expect(panel).toBeTruthy();
    if (box && panel)
      expect(Math.abs(box.x + box.width / 2 - (panel.x + panel.width / 2))).toBeLessThan(2);
    await expect(page.getByLabel('Registration number', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page);
    await capture(page, `mentor-student-login-${width}`);
    const ambient = visual.locator('[aria-hidden="true"]').first();
    await expect(ambient).not.toHaveAttribute('style', /--auth-spin/);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(ambient).toHaveAttribute('style', /--auth-spin/);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(ambient).not.toHaveAttribute('style', /--auth-spin/);
    await page.getByRole('link', { name: 'Activate your account', exact: true }).click();
    await expect(page).toHaveURL('/student/register');
    await expect(page.getByLabel('Activation code')).toBeVisible();
    await page.goto('/admin/login');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  });
}

test('student login submits through the existing endpoint and displays API errors', async ({
  page,
}) => {
  await page.route('**/api/v1/student-auth/csrf', (route) =>
    route.fulfill({ json: { csrfToken: 'synthetic-csrf' } }),
  );
  await page.route('**/api/v1/student-auth/login', async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      registrationNumber: 'SYNTHETIC-REG',
      password: 'synthetic-password',
    });
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'AUTH_INVALID_CREDENTIALS',
          message: 'Invalid credentials',
          requestId: 'synthetic-request',
        },
      }),
    });
  });
  await page.goto('/student/login');
  await page.getByLabel('Registration number', { exact: true }).fill('SYNTHETIC-REG');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('form').getByRole('alert')).toContainText(
    'The registration number or password is incorrect',
  );
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await expect(page).toHaveURL('/student/login');
});
