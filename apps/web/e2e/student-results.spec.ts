import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { test, expect } from '@playwright/test';
import {
  capture,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  fixtures,
  studentSignIn,
} from './support';

const emptyText =
  "Your results haven't been published yet. They'll appear here when your university releases them.";

test('student results: published-only empty boundary across both curricula, responsive navigation and reduced motion', async ({
  page,
}) => {
  test.setTimeout(120_000);
  for (const [kind, student] of [
    ['semester', fixtures().profileStudents[0]],
    ['year', fixtures().examStudents[0]],
  ] as const) {
    if (!student) throw new Error('Missing synthetic student');
    await page.context().clearCookies();
    await studentSignIn(page, student);
    await page.goto('/student/results');
    for (const [width, height, size] of [
      [1440, 1000, 'desktop'],
      [768, 1024, 'tablet'],
      [390, 844, 'mobile'],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect(page.getByRole('heading', { level: 1, name: 'My Results' })).toBeVisible();
      await expect(page.getByRole('status')).toContainText(emptyText);
      await expect(page.locator('main')).not.toContainText(
        /CGPA|SGPA|Internal marks|External marks/,
      );
      await expect(page.getByRole('button', { name: /Download Marksheet/ })).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
      await expectNoSeriousA11yViolations(page);
      await capture(page, `phase11a-results-${kind}-${size}`);
    }
    const trigger = page.getByRole('button', { name: 'Open student navigation' });
    await trigger.click();
    const link = page.getByRole('dialog').getByRole('link', { name: 'Results', exact: true });
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(link).not.toContainText('Soon');
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))),
    ).toBe(true);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(page.getByRole('status')).toContainText(emptyText);
    await page.getByRole('link', { name: 'View examinations' }).focus();
    await expect(page.getByRole('link', { name: 'View examinations' })).toBeFocused();
    await expectNoSeriousA11yViolations(page);
    await capture(page, `phase11a-results-${kind}-reduced-motion`);
    const response = await page.request.get('/api/v1/student/results');
    expect(response.headers()['cache-control']).toBe('no-store');
    expect(await response.json()).toMatchObject({
      publicationAvailable: false,
      data: [],
      meta: { total: 0, totalPages: 0 },
    });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  }
});

test('student results: real server-rendered API error is distinct from empty and retry recovers', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const student = fixtures().profileStudents[0];
  if (!student) throw new Error('Missing synthetic student');
  await studentSignIn(page, student);
  let unavailable = true;
  const gateway = createServer((req, res) => {
    void (async () => {
      if (req.url === '/api/v1/student/results' && unavailable) {
        res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: { message: 'Synthetic outage' } }));
        return;
      }
      try {
        const upstream = await fetch(`http://127.0.0.1:4100${req.url ?? '/'}`, {
          headers: { Cookie: req.headers.cookie ?? '' },
        });
        res.writeHead(upstream.status, {
          'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(Buffer.from(await upstream.arrayBuffer()));
      } catch {
        res.writeHead(503);
        res.end();
      }
    })();
  });
  await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve));
  const address = gateway.address();
  if (!address || typeof address === 'string') throw new Error('Gateway unavailable');
  const web = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--port', '3101', '--hostname', '127.0.0.1'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        API_INTERNAL_URL: `http://127.0.0.1:${address.port}`,
      },
      stdio: 'ignore',
    },
  );
  try {
    await expect
      .poll(
        async () => {
          try {
            return (await fetch('http://127.0.0.1:3101')).status;
          } catch {
            return 0;
          }
        },
        { timeout: 30_000 },
      )
      .toBe(200);
    await page.setViewportSize({ width: 390, height: 844 });
    // Cookies are host-scoped; this same-host test server uses the genuine synthetic student session.
    await page.goto('http://127.0.0.1:3101/student/results');
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      "Results couldn't be loaded",
    );
    await expect(page.getByRole('status')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page);
    await capture(page, 'phase11a-results-error-mobile');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await capture(page, 'phase11a-results-error-desktop');
    unavailable = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('status')).toContainText(emptyText);
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  } finally {
    web.kill('SIGTERM');
    await new Promise<void>((resolve) =>
      gateway.close(() => {
        resolve();
      }),
    );
  }
});
