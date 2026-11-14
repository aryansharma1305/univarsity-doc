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

test('/verify redirects to the one homepage and drops unsolicited reference query data', async ({
  page,
  request,
}) => {
  const response = await request.get('/verify', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe('/');
  await page.goto('/verify?reference=SYNTHETIC-UNSOLICITED-REFERENCE');
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Verify. Trust. Confirm.' }),
  ).toBeVisible();
  await expect(page.locator('main form,main input,main textarea')).toHaveCount(0);
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

test('without JavaScript the homepage discloses unavailability and preserves direct portal links', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
    baseURL: testInfo.project.use.baseURL,
  });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Verify. Trust. Confirm.' }),
    ).toBeVisible();
    await expect(
      page.getByText(/public verification of results and certificates on its way/),
    ).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.locator('main section')).toHaveCount(1);
    await expect(page.locator('main form,main input,main textarea')).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Sign in to the student portal', exact: true }),
    ).toHaveAttribute('href', '/student/login');
    await expect(
      page.getByRole('link', { name: 'Activate your account', exact: true }),
    ).toHaveAttribute('href', '/student/register');
    await expectNoHorizontalOverflow(page);
  } finally {
    await context.close();
  }
});
