import { type Page, expect, test } from '@playwright/test';
import { fixtures, signIn, studentSignIn } from './support';

/**
 * Content-Security-Policy (src/lib/csp.ts): the enforced policy must not break any page, and the
 * strict report-only policy must already be clean, so it can be enforced later without breakage.
 * Chromium logs both kinds of violation to the console ("[Report Only] Refused to …").
 */
function collectCspViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (text.includes('Content Security Policy')) violations.push(`${page.url()}: ${text}`);
  });
  return violations;
}

async function visit(page: Page, path: string): Promise<void> {
  const response = await page.goto(path);
  expect(response?.status(), path).toBeLessThan(400);
  await page.waitForLoadState('networkidle');
}

test('pages send both CSP headers, and every inline script carries the request nonce', async ({
  request,
}) => {
  for (const path of ['/', '/help', '/status', '/admin/login', '/student/login']) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    const headers = response.headers();
    expect(headers['content-security-policy'], path).toContain("frame-ancestors 'none'");
    const reportOnly = headers['content-security-policy-report-only'] ?? '';
    const nonce = /'nonce-([^']+)'/.exec(reportOnly)?.[1];
    expect(nonce, path).toBeTruthy();
    const html = await response.text();
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length, path).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag, path).toContain(`nonce="${nonce ?? ''}"`);
  }
  // A fresh nonce per response: the homepage is no longer served from the prerender cache.
  const [a, b] = await Promise.all([request.get('/'), request.get('/')]);
  expect(a.headers()['content-security-policy-report-only']).not.toBe(
    b.headers()['content-security-policy-report-only'],
  );
});

test('public and sign-in pages load without any CSP violation', async ({ page }) => {
  const violations = collectCspViolations(page);
  for (const path of ['/', '/help', '/privacy', '/terms', '/contact', '/status', '/results']) {
    await visit(page, path);
  }
  await visit(page, '/admin/login');
  await visit(page, '/student/login');
  // The homepage hero must be visible: the MOTION_GUARD script and GSAP ran under the policy.
  await visit(page, '/');
  await expect(page.locator('body')).not.toHaveAttribute('data-dv-motion', { timeout: 5000 });
  expect(violations).toEqual([]);
});

test('signed-in staff and student pages load without any CSP violation', async ({ page }) => {
  const violations = collectCspViolations(page);
  await signIn(page, fixtures().admin);
  for (const path of ['/admin', '/admin/students', '/admin/imports', '/admin/security/mfa']) {
    await visit(page, path);
  }
  await page.context().clearCookies();
  await studentSignIn(page, fixtures().sampleStudent);
  for (const path of ['/student', '/student/profile', '/student/documents']) {
    await visit(page, path);
  }
  expect(violations).toEqual([]);
});

test('the report sink accepts a violation report', async ({ request }) => {
  const response = await request.post('/csp-report', {
    headers: { 'content-type': 'application/csp-report' },
    data: JSON.stringify({
      'csp-report': {
        'document-uri': 'http://127.0.0.1/',
        'effective-directive': 'script-src-elem',
        'blocked-uri': 'inline',
      },
    }),
  });
  expect(response.status()).toBe(204);
});
