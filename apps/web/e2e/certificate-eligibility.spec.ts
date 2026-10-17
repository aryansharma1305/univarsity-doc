import { test, expect } from '@playwright/test';
import {
  fixtures,
  studentSignIn,
  signIn,
  capture,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
} from './support';

test('student sees registration-specific certificate eligibility without any new action', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await studentSignIn(page, fixtures().eligibilityStudent);
  await page.goto('/student/certificate-requests');
  const section = page.getByRole('region', { name: 'Certificates for your courses' });
  await expect(section.getByRole('article')).toHaveCount(4);
  const short = section.getByRole('article', {
    name: 'E2E Certificate Course in Clinical Data Handling',
  });
  await expect(short.getByText('Offered for this course', { exact: true })).toHaveCount(1);
  await expect(short.getByText('Not offered for this course', { exact: true })).toHaveCount(4);
  await expect(short.getByText(/Rector approval and issuance are not available yet/)).toBeVisible();
  const diploma = section.getByRole('article', {
    name: 'E2E Postgraduate Diploma in Applied Research',
  });
  await expect(diploma.getByText('Proposal awaiting approval', { exact: true })).toBeVisible();
  await expect(diploma.getByText('Pending course approval', { exact: true })).toHaveCount(3);
  const degree = section.getByRole('article', { name: 'E2E Bachelor of Applied Studies' });
  await expect(degree.getByText('Not configured', { exact: true })).toBeVisible();
  await expect(degree.getByText('Pending course approval', { exact: true })).toHaveCount(4);
  const year = section.getByRole('article', { name: 'E2E One-Year Diploma' });
  await expect(year.getByText('University policy pending', { exact: true })).toHaveCount(5);
  await expect(section.getByRole('button')).toHaveCount(0);
  // Phase 12B applications stay unavailable, including Course Completion.
  await expect(page.getByRole('button', { name: 'Not available yet' })).toHaveCount(5);
  for (const [width, height, label] of [
    [1440, 1000, 'desktop'],
    [768, 1024, 'tablet'],
    [390, 844, 'mobile'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page);
    await capture(page, `phase12c-student-eligibility-${label}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await short.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'test-results/screenshots/phase12c-student-eligibility-mobile-viewport.png',
  });
  // A different student never sees these registrations.
  await page.context().clearCookies();
  const other = fixtures().profileStudents[1];
  if (!other) throw new Error('Missing second student');
  await studentSignIn(page, other);
  await page.goto('/student/certificate-requests');
  await expect(page.getByText('E2E-REG-0301')).toHaveCount(0);
});

test('staff course panel shows policy tiers, pending proposal and disabled approval', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page, fixtures().admin);
  await page.goto(`/admin/programs/${fixtures().eligibilityPrograms.m18}`);
  const panel = page.getByRole('region', { name: 'Certificate eligibility' });
  await expect(panel.getByText('More than 12 months, through 24 months')).toBeVisible();
  await expect(
    panel.getByText('Proposal awaiting approval', { exact: true }).first(),
  ).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Approve set' })).toBeDisabled();
  await expect(panel.getByText(/Approval is disabled/)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Propose certificate set' })).toHaveCount(0);
  for (const [width, height, label] of [
    [1440, 1000, 'desktop'],
    [768, 1024, 'tablet'],
    [390, 844, 'mobile'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page);
    // The whole panel, not just the visible viewport.
    await panel.screenshot({
      path: `test-results/screenshots/phase12c-staff-pending-${label}.png`,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/admin/programs/${fixtures().eligibilityPrograms.m12}`);
  const unresolved = page.getByRole('region', { name: 'Certificate eligibility' });
  await expect(unresolved.getByText(/1-year \(12-month\) courses are not covered/)).toBeVisible();
  await expect(unresolved.getByRole('button', { name: 'Propose certificate set' })).toHaveCount(0);
  await unresolved.screenshot({ path: 'test-results/screenshots/phase12c-staff-unresolved.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await unresolved.screenshot({
    path: 'test-results/screenshots/phase12c-staff-unresolved-mobile.png',
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  // The 36-month course can be proposed, offering Migration but never Course Completion.
  await page.goto(`/admin/programs/${fixtures().eligibilityPrograms.m36}`);
  const degree = page.getByRole('region', { name: 'Certificate eligibility' });
  await degree.getByRole('button', { name: 'Propose certificate set' }).click();
  const form = degree.getByRole('form', { name: 'Propose a certificate set' });
  await expect(form.getByRole('checkbox')).toHaveCount(4);
  await expect(form.getByText('Course completion certificate')).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
  await form.getByRole('checkbox').first().check();
  await form.getByLabel(/University authority reference/).fill('Synthetic council decision');
  await form.screenshot({ path: 'test-results/screenshots/phase12c-staff-propose-form.png' });
  // Review step only: the proposal is never submitted here.
  await form.getByRole('button', { name: 'Review proposal' }).click();
  await expect(form.getByRole('status')).toContainText('A different, authorized person');
  await form.screenshot({ path: 'test-results/screenshots/phase12c-staff-propose-review.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await form.screenshot({
    path: 'test-results/screenshots/phase12c-staff-propose-review-mobile.png',
  });
});

test('viewer cannot see course eligibility', async ({ page }) => {
  await signIn(page, fixtures().viewer);
  await page.goto(`/admin/programs/${fixtures().eligibilityPrograms.m18}`);
  await expect(page.locator('#versions-heading')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Certificate eligibility' })).toHaveCount(0);
});

test('staff generate all five synthetic academic certificate samples', async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, fixtures().admin);
  await page.goto('/admin/certificate-templates');
  const generate = page.getByRole('button', { name: 'Generate academic sample PDF' });
  await expect(generate).toBeEnabled();
  for (const type of ['COURSE_COMPLETION', 'TRANSCRIPT', 'PROVISIONAL', 'CHARACTER', 'MIGRATION']) {
    await page.getByLabel('Certificate type').selectOption(type);
    const response = page.waitForResponse(
      (r) => r.url().includes('/certificate-templates/academic/preview?') && r.status() === 200,
    );
    await generate.click();
    const pdf = await response;
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    expect(pdf.headers()['cache-control']).toBe('no-store');
    await expect(page.getByTitle(/^Synthetic .+ PDF preview$/)).toBeVisible();
    // Headless Chromium reports the inline PDF iframe itself as a blob download; wait for the link's file.
    const downloading = page.waitForEvent('download', (d) =>
      d.suggestedFilename().startsWith('sample-'),
    );
    await page.getByRole('link', { name: 'Download academic sample' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/^sample-[a-z-]+-standard-v1\.pdf$/);
    await download.saveAs(`test-results/screenshots/phase12c-${download.suggestedFilename()}`);
  }
  // Multipage stress transcripts are offered for transcripts only.
  await page.getByLabel('Certificate type').selectOption('MIGRATION');
  await expect(page.getByLabel('Invented record').locator('option')).toHaveCount(2);
  await page.getByLabel('Certificate type').selectOption('TRANSCRIPT');
  for (const fixture of ['stress-semester', 'stress-year']) {
    await page.getByLabel('Invented record').selectOption(fixture);
    const response = page.waitForResponse(
      (r) => r.url().includes(`fixture=${fixture}`) && r.status() === 200,
    );
    await generate.click();
    await response;
    await expect(page.getByTitle(/^Synthetic .+ PDF preview$/)).toBeVisible();
    const downloading = page.waitForEvent('download', (d) =>
      d.suggestedFilename().startsWith('sample-'),
    );
    await page.getByRole('link', { name: 'Download academic sample' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe(`sample-transcript-${fixture}-v1.pdf`);
    await download.saveAs(`test-results/screenshots/phase12c-${download.suggestedFilename()}`);
  }
  for (const [width, height, label] of [
    [1440, 1000, 'desktop'],
    [390, 844, 'mobile'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page);
    await page
      .getByRole('region', { name: 'Academic certificate samples' })
      .screenshot({ path: `test-results/screenshots/phase12c-templates-${label}.png` });
    await capture(page, `phase12c-templates-page-${label}`);
  }
});
