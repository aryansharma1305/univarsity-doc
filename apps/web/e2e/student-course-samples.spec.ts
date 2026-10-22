import { test, expect, type Page } from '@playwright/test';
import {
  fixtures,
  studentSignIn,
  capture,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
} from './support';

const section = (page: Page) => page.getByRole('region', { name: 'Samples for your courses' });
const SAMPLE_LINK =
  /\/api\/v1\/student\/certificate-samples\/registrations\/[0-9a-f-]{36}\/sample-[a-z-]+-v1\/file\?disposition=(inline|attachment)/;

async function chooseCourse(page: Page, name: string) {
  const select = section(page).getByLabel('Choose a course');
  const option = select.locator('option', { hasText: name });
  await select.selectOption({ value: (await option.getAttribute('value')) ?? '' });
}

test('a student with several courses chooses one; only approved academic samples are offered', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await studentSignIn(page, fixtures().sampleStudent);
  await page.goto('/student/documents');
  const samples = section(page);
  // UI-05's generic training sample is unchanged and separate.
  await expect(
    page.getByRole('heading', { name: 'Training Certificate', exact: true }),
  ).toBeVisible();
  // Nothing is preselected among five registrations.
  await expect(samples.getByLabel('Choose a course')).toHaveValue('');
  await expect(
    samples.getByText('You have 5 courses. Choose one to see its certificate samples.'),
  ).toBeVisible();
  await expect(samples.getByRole('link')).toHaveCount(0);

  for (const [width, height, label] of [
    [1440, 1000, 'desktop'],
    [768, 1024, 'tablet'],
    [390, 844, 'mobile'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await chooseCourse(page, 'E2E Master of Applied Studies');
    await expect(samples.getByRole('link', { name: /^Preview .* sample/ })).toHaveCount(3);
    await expect(
      samples.getByText(
        /Not offered for this course: Migration Certificate, Course Completion Certificate/,
      ),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page);
    await samples.screenshot({
      path: `test-results/screenshots/phase12c1-samples-24m-${label}.png`,
    });
    await capture(page, `phase12c1-documents-${label}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Every sample link is registration-scoped and returns the fixed synthetic PDF with safe headers.
  for (const link of await samples.getByRole('link').all()) {
    const href = (await link.getAttribute('href')) ?? '';
    expect(href).toMatch(SAMPLE_LINK);
    const response = await page.request.get(href);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');
    expect(response.headers()['cache-control']).toBe('no-store');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
  }
  for (const title of ['Transcript', 'Provisional Certificate', 'Character Certificate']) {
    const downloading = page.waitForEvent('download');
    await samples.getByRole('link', { name: `Download ${title} sample PDF` }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(
      /^sample-(transcript|provisional|character)-v1\.pdf$/,
    );
    await download.saveAs(`test-results/screenshots/phase12c1-${download.suggestedFilename()}`);
  }

  // 36-month course: Migration becomes available.
  await chooseCourse(page, 'E2E Bachelor of Science (Honours)');
  await expect(samples.getByRole('link', { name: /^Preview .* sample/ })).toHaveCount(4);
  const migration = page.waitForEvent('download');
  await samples.getByRole('link', { name: 'Download Migration Certificate sample PDF' }).click();
  await (await migration).saveAs('test-results/screenshots/phase12c1-sample-migration-v1.pdf');
  await samples.screenshot({ path: 'test-results/screenshots/phase12c1-samples-36m-desktop.png' });

  // 3-month course: Course Completion only.
  await chooseCourse(page, 'E2E Certificate Course in Clinical Data Handling');
  await expect(samples.getByRole('link', { name: /^Preview .* sample/ })).toHaveCount(1);
  const completion = page.waitForEvent('download');
  await samples
    .getByRole('link', { name: 'Download Course Completion Certificate sample PDF' })
    .click();
  await (
    await completion
  ).saveAs('test-results/screenshots/phase12c1-sample-course-completion-v1.pdf');

  // Withdrawn set: types the policy permits are awaiting approval, with no sample.
  await chooseCourse(page, 'E2E Diploma in Data Practice');
  await expect(samples.getByText('Not currently approved for this course')).toHaveCount(3);
  await expect(samples.getByRole('link')).toHaveCount(0);
  await samples.screenshot({
    path: 'test-results/screenshots/phase12c1-samples-withdrawn-desktop.png',
  });

  // Unresolved 1-year course: explanation, nothing offered.
  await chooseCourse(page, 'E2E One-Year Diploma');
  await expect(samples.getByRole('note')).toContainText('1-year courses');
  await expect(
    samples.getByText(/Certificate availability for this course has not been confirmed yet/),
  ).toBeVisible();
  await expect(samples.getByRole('link')).toHaveCount(0);
  await samples.screenshot({
    path: 'test-results/screenshots/phase12c1-samples-unresolved-desktop.png',
  });
  await expectNoSeriousA11yViolations(page);

  // Keyboard: the selector is reachable and operable.
  await samples.getByLabel('Choose a course').focus();
  await expect(samples.getByLabel('Choose a course')).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(section(page).getByLabel('Choose a course')).toHaveValue('');
});

test('a single-registration student sees their course directly, with no selector', async ({
  page,
}) => {
  await studentSignIn(page, fixtures().singleSampleStudent);
  await page.goto('/student/documents');
  const samples = section(page);
  await expect(samples.getByLabel('Choose a course')).toHaveCount(0);
  await expect(samples.getByText('E2E Master of Applied Studies')).toBeVisible();
  await expect(samples.getByRole('link', { name: /^Preview .* sample/ })).toHaveCount(3);
  for (const [width, height, label] of [
    [1440, 1000, 'desktop'],
    [390, 844, 'mobile'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page);
    await samples.screenshot({ path: `test-results/screenshots/phase12c1-single-${label}.png` });
  }
});

test('a student cannot open another student’s registration sample or unapproved types', async ({
  page,
}) => {
  // Learn the single-course student's registration id from their own session.
  await studentSignIn(page, fixtures().singleSampleStudent);
  const theirs = await page.request.get('/api/v1/student/certificate-eligibility');
  const registrationId = ((await theirs.json()) as { registrations: { registrationId: string }[] })
    .registrations[0]?.registrationId;
  expect(registrationId).toBeTruthy();
  const own = await page.request.get(
    `/api/v1/student/certificate-samples/registrations/${registrationId ?? ''}/sample-transcript-v1/file`,
  );
  expect(own.status()).toBe(200);
  const unapproved = await page.request.get(
    `/api/v1/student/certificate-samples/registrations/${registrationId ?? ''}/sample-migration-v1/file`,
  );
  expect(unapproved.status()).toBe(404);
  await page.context().clearCookies();
  await studentSignIn(page, fixtures().sampleStudent);
  const foreign = await page.request.get(
    `/api/v1/student/certificate-samples/registrations/${registrationId ?? ''}/sample-transcript-v1/file`,
  );
  expect(foreign.status()).toBe(404);
  await page.context().clearCookies();
  const anonymous = await page.request.get(
    `/api/v1/student/certificate-samples/registrations/${registrationId ?? ''}/sample-transcript-v1/file`,
  );
  expect(anonymous.status()).toBe(401);
});
