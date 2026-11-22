import {
  errorResponseSchema,
  publicVerificationServices,
  unavailableVerificationResponseSchema,
} from '@docversity/validation';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { expectNoHorizontalOverflow } from './support';

async function postWithinBudget(request: APIRequestContext, path: string, data: object) {
  let response = await request.post(path, { data });
  if (response.status() === 429) {
    const seconds = Number(response.headers()['retry-after']);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(60);
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000 + 1000));
    response = await request.post(path, { data });
  }
  return response;
}

test('/verify redirects to the admission-letter page and drops unsolicited reference query data', async ({
  page,
  request,
}) => {
  const response = await request.get('/verify', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe('/verify/admission-letter');
  await page.goto('/verify?reference=SYNTHETIC-UNSOLICITED-REFERENCE');
  await expect(page).toHaveURL(
    (url) => url.pathname === '/verify/admission-letter' && url.search === '',
  );
  await expect(
    page.getByRole('heading', { level: 1, name: 'Verify Admission Letter' }),
  ).toBeVisible();
  await expect(page.getByPlaceholder('Enter admission letter number')).toBeVisible();
  await expect(page.getByText('SYNTHETIC-UNSOLICITED-REFERENCE')).toHaveCount(0);
});

test('all four real API contracts remain fail-closed, no-store and strictly validated', async ({
  request,
}) => {
  test.setTimeout(120000);
  for (const service of publicVerificationServices) {
    const path = `/api/v1/public/verify/${service}`;
    const response = await postWithinBudget(request, path, {
      contractVersion: 1,
      reference: 'SYNTHETIC-UI04-REFERENCE',
    });
    expect(response.status()).toBe(200);
    expect(unavailableVerificationResponseSchema.parse(await response.json())).toMatchObject({
      service,
      status: 'UNAVAILABLE',
    });
    expect(response.headers()['cache-control']).toBe('no-store');
    expect(response.headers()['set-cookie']).toBeUndefined();
    const absent = await postWithinBudget(request, path, {
      contractVersion: 1,
      reference: 'DOES-NOT-EXIST-UI04',
    });
    expect(absent.status()).toBe(200);
    expect(await absent.json()).toEqual(await response.json());
    const invalid = await postWithinBudget(request, path, {
      contractVersion: 1,
      reference: 'https://invalid.example/private',
    });
    expect(invalid.status()).toBe(400);
    expect(errorResponseSchema.parse(await invalid.json()).error.code).toBe('VALIDATION_FAILED');
    const query = await postWithinBudget(request, `${path}?reference=private`, {
      contractVersion: 1,
      reference: 'SYNTHETIC-UI04',
    });
    expect(query.status()).toBe(400);
  }
});

test('without JavaScript the admission-letter page discloses unavailability and keeps references out of URLs', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
    baseURL: testInfo.project.use.baseURL,
  });
  try {
    const page = await context.newPage();
    await page.goto('/verify/admission-letter');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Verify Admission Letter' }),
    ).toBeVisible();
    await expect(page.getByRole('status')).toContainText('No record checked yet');
    const input = page.getByPlaceholder('Enter admission letter number');
    await input.fill('SYNTHETIC-LOCAL-ONLY');
    await page.getByRole('button', { name: 'Verify Admission Letter', exact: true }).click();
    await expect(page).toHaveURL(
      (url) => url.pathname === '/verify/admission-letter' && url.search === '',
    );
    await expect(page.getByRole('link', { name: 'Student Sign in', exact: true })).toBeVisible();
    await expect(page.getByRole('status')).toContainText(
      'Only university-approved records can be verified',
    );
    await expectNoHorizontalOverflow(page);
  } finally {
    await context.close();
  }
});

test('homepage search opens each service, runs exactly one server-decided check and keeps the number out of URLs', async ({
  page,
}) => {
  test.setTimeout(120000);
  const services = [
    ['Verify Certificate', '/verify/certificate', 'certificate'],
    ['Verify Registration', '/verify/registration', 'registration'],
    ['Verify Admission Letter', '/verify/admission-letter', 'admission-letter'],
  ] as const;
  const reference = 'SYNTHETIC-HOME-SEARCH';
  const posts: string[] = [];
  const urls: string[] = [];
  page.on('request', (request) => {
    urls.push(request.url());
    if (request.method() === 'POST' && request.url().includes('/api/v1/public/verify/')) {
      posts.push(new URL(request.url()).pathname);
    }
  });
  for (const [label, path, service] of services) {
    posts.length = 0;
    await page.goto('/');
    const search = page.getByRole('search', { name: 'Verify a record' });
    await search.getByRole('combobox', { name: 'Service' }).selectOption({ label });
    await search.getByRole('textbox').fill(reference);
    const lookup = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === `/api/v1/public/verify/${service}`,
    );
    await search.getByRole('button', { name: 'Search' }).click();
    await expect(page).toHaveURL((url) => url.pathname === path && !url.href.includes(reference));
    // The server's policy decides the answer (UNAVAILABLE, or NOT FOUND where a policy is enabled);
    // the public rate limit may also answer 429. Each is shown, never a silent page.
    expect([200, 429]).toContain((await lookup).status());
    await expect(page.locator('[role="status"], [role="alert"]').first()).toContainText(
      /Verification not available|No verified record found|Sign in required|Too many checks/i,
    );
    await expect(page.getByRole('textbox')).toHaveValue(reference);
    await expect.poll(() => posts).toEqual([`/api/v1/public/verify/${service}`]);
    await page.reload();
    await expect(page.getByRole('textbox')).toHaveValue('');
    // Bounded settle so a late duplicate lookup (after navigation or reload) would be counted.
    await page.waitForTimeout(1000);
    expect(posts).toHaveLength(1);
  }
  expect(urls.filter((url) => url.includes(reference))).toEqual([]);

  // Check Result takes course, roll number and semester on its own page: no number, no lookup.
  posts.length = 0;
  await page.goto('/');
  const search = page.getByRole('search', { name: 'Verify a record' });
  await search.getByRole('combobox', { name: 'Service' }).selectOption({ label: 'Check Result' });
  await expect(search.getByRole('textbox')).toBeDisabled();
  await search.getByRole('button', { name: 'Search' }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/results');
  await expect(page.getByLabel('Course Name', { exact: true })).toBeVisible();
  await page.waitForTimeout(1000);
  expect(posts).toEqual(['/api/v1/public/verify/result-options']);
});
