import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 14B staging smoke tests: real HTTPS through Caddy's reviewer gate into the production-mode
 * Next.js, NestJS, PostgreSQL, Redis, MinIO and worker stack, using the synthetic reviewer accounts.
 * The suite writes only clearly labelled synthetic records (a REVIEW-SMOKE department).
 */
interface Reviewers {
  gate: { username: string; password: string };
  staff: { role: string; email: string; password: string }[];
  student: { registrationNumber: string; password: string };
}
const reviewers = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../.local/staging/reviewers.json', import.meta.url)),
    'utf8',
  ),
) as Reviewers;
const staff = (role: string) => {
  const account = reviewers.staff.find((s) => s.role === role);
  if (!account) throw new Error(`Missing ${role} reviewer`);
  return account;
};
const shot = (page: Page, name: string, project: string) =>
  page.screenshot({ path: `test-results/staging/screens/${project}-${name}.png`, fullPage: true });

async function staffSignIn(page: Page, role: string) {
  const account = staff(role);
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
async function studentSignIn(page: Page) {
  await page.goto('/student/login');
  await page.getByLabel('Registration number').fill(reviewers.student.registrationNumber);
  await page.getByLabel('Password').fill(reviewers.student.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/student$/);
}
/** A same-origin unsafe API call with the signed-in principal's CSRF token. */
async function post(
  page: Page,
  path: string,
  data: unknown,
  portal: 'auth' | 'student-auth' = 'auth',
) {
  const csrf = await page.request.get(`/api/v1/${portal}/csrf`);
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };
  return page.request.post(path, {
    data,
    headers: { 'X-CSRF-Token': csrfToken, Origin: new URL(page.url()).origin },
  });
}
async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test('the reviewer gate admits only authorized reviewers and keeps the site out of search', async ({
  browser,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'HTTP-level check');
  // Fresh contexts without (or with wrong) gate credentials; TLS is still validated.
  for (const httpCredentials of [
    undefined,
    { username: reviewers.gate.username, password: 'wrong-password', send: 'always' as const },
  ]) {
    const context = await browser.newContext({ baseURL, httpCredentials });
    try {
      for (const path of ['/', '/health', '/admin/login', '/student/login', '/api/v1/auth/csrf'])
        expect((await context.request.get(path)).status(), path).toBe(401);
      const robots = await context.request.get('/robots.txt');
      expect(robots.status()).toBe(200);
      expect(await robots.text()).toContain('Disallow: /');
    } finally {
      await context.close();
    }
  }
});

test('UI-04 homepage: four unavailable services, no forms, portal links; protected routes need a session', async ({
  page,
}, info) => {
  const home = await page.goto('/');
  expect(home?.status()).toBe(200);
  expect(home?.headers()['x-robots-tag']).toContain('noindex');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Verify. Trust. Confirm.' }),
  ).toBeVisible();
  // Every verification service is honestly unavailable and the page collects no identifiers.
  await expect(page.getByRole('tab')).toHaveCount(4);
  for (const tab of await page.getByRole('tab').all())
    await expect(tab).toContainText('Not available yet');
  await expect(page.locator('main form,main input,main textarea')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Student portal', exact: true })).toHaveAttribute(
    'href',
    '/student/login',
  );
  await expect(page.getByRole('link', { name: 'Staff access', exact: true })).toHaveAttribute(
    'href',
    '/admin/login',
  );
  await expectNoOverflow(page);
  await shot(page, 'home', info.project.name);
  // The former /verify page redirects to the single homepage.
  const verify = await page.request.get('/verify', { maxRedirects: 0 });
  expect(verify.status()).toBe(307);
  expect(verify.headers().location).toBe('/');
  for (const service of ['result', 'registration', 'certificate', 'admission-letter']) {
    const response = await page.request.post(`/api/v1/public/verify/${service}`, {
      data: { contractVersion: 1, reference: 'SYNTHETIC-14B' },
      headers: { Origin: new URL(page.url()).origin },
    });
    expect(response.status(), service).toBe(200);
    expect(((await response.json()) as { status: string }).status).toBe('UNAVAILABLE');
  }
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.goto('/student');
  await expect(page).toHaveURL(/\/student\/login/);
  for (const path of ['/api/v1/students', '/api/v1/student/me', '/api/v1/auth/me'])
    expect((await page.request.get(path)).status(), path).toBe(401);
  expect((await page.request.get('/api/docs')).status()).toBe(404);
});

test('student: sign in, dashboard, course, documents and the training sample; nothing official', async ({
  page,
}, info) => {
  await studentSignIn(page);
  await expectNoOverflow(page);
  await shot(page, 'student-dashboard', info.project.name);
  await page.goto('/student/course');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await shot(page, 'student-course', info.project.name);
  await page.goto('/student/documents');
  await expect(
    page.getByRole('heading', { name: 'Training Certificate', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Samples for your courses' })).toBeVisible();
  await expectNoOverflow(page);
  await shot(page, 'student-documents', info.project.name);
  const sample = await page.request.get(
    '/api/v1/student/certificate-samples/sample-training-v1/file?disposition=attachment',
  );
  expect(sample.status()).toBe(200);
  expect(sample.headers()['content-type']).toContain('application/pdf');
  expect(sample.headers()['cache-control']).toBe('no-store');
  expect((await sample.body()).subarray(0, 5).toString()).toBe('%PDF-');
  // No course certificate set is approved on staging, so no academic sample is served.
  const eligibility = (await (
    await page.request.get('/api/v1/student/certificate-eligibility')
  ).json()) as {
    registrations: { registrationId: string; certificates: { typeEligibility: string }[] }[];
  };
  expect(eligibility.registrations).toHaveLength(3);
  const types = eligibility.registrations.flatMap((r) =>
    r.certificates.map((c) => c.typeEligibility),
  );
  expect(types).not.toContain('APPROVED_FOR_COURSE');
  const registrationId = eligibility.registrations[0]?.registrationId ?? '';
  expect(
    (
      await page.request.get(
        `/api/v1/student/certificate-samples/registrations/${registrationId}/sample-transcript-v1/file`,
      )
    ).status(),
  ).toBe(404);
  // The student session never authorizes staff routes.
  expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
  expect((await page.request.get('/api/v1/students')).status()).toBe(401);
  await page.goto('/student/results');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await shot(page, 'student-results', info.project.name);
});

test('registrar: dashboard, courses, students and a synthetic write; no examination authority', async ({
  page,
}, info) => {
  await staffSignIn(page, 'REGISTRAR');
  await shot(page, 'registrar-dashboard', info.project.name);
  await page.goto('/admin/programs');
  await expect(
    page
      .getByText('SYNTHETIC Bachelor of Science in Data Studies')
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expectNoOverflow(page);
  await shot(page, 'registrar-courses', info.project.name);
  await page.goto('/admin/students');
  await expect(
    page.getByText('SYNTHETIC Asha Reviewer').filter({ visible: true }).first(),
  ).toBeVisible();
  await shot(page, 'registrar-students', info.project.name);
  const registrations = await page.request.get('/api/v1/registrations?search=REVIEW-REG');
  expect(registrations.status()).toBe(200);
  const code = `REVIEW-SMOKE-${randomUUID().slice(0, 6).toUpperCase()}`;
  const created = await post(page, '/api/v1/departments', {
    code,
    name: `SYNTHETIC Smoke Department ${code}`,
  });
  expect(created.status()).toBe(201);
  // Least privilege: the registrar cannot manage examinations or publish results.
  expect((await post(page, '/api/v1/examinations', { code: 'REVIEW-DENIED' })).status()).toBe(403);
  expect(
    (
      await post(page, `/api/v1/result-review/${randomUUID()}/publish`, {
        requestId: randomUUID(),
        expectedVersion: 1,
        confirmed: true,
      })
    ).status(),
  ).toBe(403);
  // A staff session never authorizes student routes.
  expect((await page.request.get('/api/v1/student/me')).status()).toBe(401);
});

test('examination staff: examinations workspace; no student-record or publication authority', async ({
  page,
}, info) => {
  await staffSignIn(page, 'EXAM_ADMIN');
  await page.goto('/admin/examinations');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoOverflow(page);
  await shot(page, 'exams-examinations', info.project.name);
  await page.goto('/admin/results');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await shot(page, 'exams-results', info.project.name);
  expect(
    (await post(page, '/api/v1/students', { fullName: 'SYNTHETIC Denied Student' })).status(),
  ).toBe(403);
  expect(
    (
      await post(page, `/api/v1/result-review/${randomUUID()}/publish`, {
        requestId: randomUUID(),
        expectedVersion: 1,
        confirmed: true,
      })
    ).status(),
  ).toBe(403);
});

test('university administrator: every module visible; publication and approval stay blocked', async ({
  page,
}, info) => {
  await staffSignIn(page, 'SUPER_ADMIN');
  await expectNoOverflow(page);
  await shot(page, 'admin-dashboard', info.project.name);
  for (const path of [
    '/admin/programs',
    '/admin/examinations',
    '/admin/results',
    '/admin/certificate-requests',
    '/admin/certificate-templates',
    '/admin/historical-documents',
    '/admin/imports',
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }), path).toBeVisible();
  }
  // Even the administrator cannot publish results or approve course certificate sets.
  const publish = await post(page, `/api/v1/result-review/${randomUUID()}/publish`, {
    requestId: randomUUID(),
    expectedVersion: 1,
    confirmed: true,
  });
  expect(publish.status()).toBe(409);
  const approve = await post(page, `/api/v1/certificate-eligibility/${randomUUID()}/approve`, {});
  expect(approve.status()).toBeGreaterThanOrEqual(400);
});
