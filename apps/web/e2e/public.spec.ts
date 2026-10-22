import { expect, test } from '@playwright/test';
import { capture, expectNoHorizontalOverflow, expectNoSeriousA11yViolations } from './support';

const SERVICES = [
  { id: 'result', title: 'Result Checking', detail: 'Academic results' },
  { id: 'registration', title: 'Registration Verification', detail: 'University registrations' },
  { id: 'certificate', title: 'Certificate Verification', detail: 'Academic certificates' },
  { id: 'admission-letter', title: 'Admission Letter Verification', detail: 'Admission letters' },
];
for (const [width, height] of [
  [1440, 1000],
  [768, 1024],
  [390, 844],
  [320, 844],
] as const) {
  test(`verification homepage is accessible and unavailable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const requests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/v1/')) requests.push(request.url());
    });
    await page.goto('/');
    await expect(page).toHaveTitle('Docversity | Verification');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Verify. Trust. Confirm.' }),
    ).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(4);
    await expect(page.getByRole('tab', { name: 'Result Checking', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('link', { name: 'Verify Certificate', exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByRole('link', { name: 'View Services', exact: true })).toHaveCount(0);
    const cards = await page.getByRole('tablist').boundingBox();
    const panel = await page.getByRole('tabpanel').boundingBox();
    expect(cards).not.toBeNull();
    expect(panel).not.toBeNull();
    if (cards && panel) expect(panel.y).toBeGreaterThanOrEqual(cards.y + cards.height);
    await capture(page, `ui04-home-${width}`);
    for (const service of SERVICES) {
      const tab = page.getByRole('tab', { name: service.title, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await expect(tab.getByText(service.detail, { exact: true })).toBeVisible();
      await expect(page.getByRole('tabpanel')).toHaveCount(1);
      await expect(
        page.getByRole('tabpanel').getByRole('heading', { name: service.title, exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('tabpanel').getByRole('status')).toHaveText('Not available yet');
      await expect(page.locator('main form,main input,main textarea,main select')).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
      await expectNoSeriousA11yViolations(page);
      if (width === 1440 && service.id !== 'result')
        await capture(page, `ui04-service-${service.id}`);
    }
    expect(requests).toEqual([]);
    await expect(page.locator('#features,#faq,#get-started,#roadmap')).toHaveCount(0);
  });
}

test('service tabs support visible keyboard focus and immediate reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const first = page.getByRole('tab', { name: 'Result Checking', exact: true });
  await first.focus();
  const outline = await first.evaluate((el) => ({
    width: parseFloat(getComputedStyle(el).outlineWidth),
    style: getComputedStyle(el).outlineStyle,
  }));
  expect(outline.width).toBeGreaterThanOrEqual(2);
  expect(outline.style).not.toBe('none');
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('tab', { name: 'Registration Verification', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('End');
  await expect(
    page.getByRole('tab', { name: 'Admission Letter Verification', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Home');
  await expect(first).toBeFocused();
  expect(
    await page
      .getByRole('tabpanel')
      .evaluate(
        (el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
      ),
  ).toBe(0);
  await expectNoSeriousA11yViolations(page);
});

test('student and staff login navigation retains the existing routes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Student portal', exact: true }).click();
  await expect(page).toHaveURL(/\/student\/login$/);
  await page.goto('/');
  await page.getByRole('link', { name: 'Staff access', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test('legacy service routes retain honest placeholders without verification forms', async ({
  page,
}) => {
  for (const [path, title] of [
    ['/results', 'Check Results'],
    ['/verify/registration', 'Registration Verification'],
    ['/verify/certificate', 'Certificate Verification'],
    ['/verify/qr', 'Scan QR'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
    await expect(page.locator('main form,main input,main textarea')).toHaveCount(0);
  }
});

test('small-screen text remains readable without clipping at 200 percent text scale', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const title = page
    .getByRole('tab', { name: 'Result Checking', exact: true })
    .locator('span')
    .first();
  const normalSize = await title.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await expect
    .poll(() => title.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)))
    .toBeCloseTo(normalSize * 2);
  const first = await page.getByRole('tab').nth(0).boundingBox();
  const second = await page.getByRole('tab').nth(1).boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  if (first && second) expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
  const brokenWords = await page
    .locator('main h1,main [role="tab"] span')
    .evaluateAll((elements) => {
      const broken: string[] = [];
      for (const element of elements) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          for (const match of (node.textContent ?? '').matchAll(/\S+/g)) {
            const range = document.createRange();
            range.setStart(node, match.index);
            range.setEnd(node, match.index + match[0].length);
            if ([...range.getClientRects()].filter((r) => r.width > 0).length > 1)
              broken.push(match[0]);
          }
        }
      }
      return broken;
    });
  expect(brokenWords).toEqual([]);
  await expectNoHorizontalOverflow(page);
  const clipped = await page
    .getByRole('tab')
    .evaluateAll((cards) =>
      cards.some((card) =>
        [...card.querySelectorAll('span')].some((span) => span.scrollWidth > span.clientWidth + 1),
      ),
    );
  expect(clipped).toBe(false);
  await expectNoSeriousA11yViolations(page);
  await capture(page, 'ui04-text-scale-320');
});

test('optional GSAP entrance stays visible and responds to reduced-motion changes', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Reflect.set(window, '__ui04EntranceObserved', false);
    new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target;
        if (
          target instanceof HTMLElement &&
          target.hasAttribute('data-ui04-intro') &&
          target.style.transform &&
          target.style.transform !== 'none'
        )
          Reflect.set(window, '__ui04EntranceObserved', true);
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['style'] });
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__ui04EntranceObserved') === true))
    .toBe(true);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('[data-ui04-intro]')
        .evaluateAll((elements) =>
          elements.every((el) => getComputedStyle(el).transform === 'none'),
        ),
    )
    .toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page
      .locator('main')
      .evaluate(
        (el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
      ),
  ).toBe(0);
});
