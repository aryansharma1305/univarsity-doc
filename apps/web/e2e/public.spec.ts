import { expect, test } from '@playwright/test';
import { capture, expectNoHorizontalOverflow, expectNoSeriousA11yViolations } from './support';

const NAVIGATION = [
  ['Verify Admission Letter', '/verify/admission-letter'],
  ['Verify Certificate', '/verify/certificate'],
  ['Verify Registration', '/verify/registration'],
  ['Check Result', '/results'],
  ['Student Sign in', '/student/login'],
] as const;

for (const [width, height] of [
  [1440, 900],
  [768, 1024],
  [390, 844],
  [320, 844],
] as const) {
  test(`compact homepage preserves the hero and five accessible destinations at ${width}px`, async ({
    page,
  }) => {
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
    await expect(page.getByRole('img', { name: 'Docversity University' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in to the student portal' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Activate your account' })).toBeVisible();
    await expect(page.locator('main section')).toHaveCount(1);
    await expect(
      page.locator(
        '#services,#students,#how,#privacy,#portals,#features,#faq,#get-started,#roadmap',
      ),
    ).toHaveCount(0);
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.locator('main form,main input,main textarea,main select')).toHaveCount(0);
    await expect(page.getByRole('contentinfo').getByRole('link')).toHaveText(['Privacy', 'Terms']);
    if (width === 1440) {
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
        height + 1,
      );
    }
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page);
    await capture(page, `mentor-home-${width}`);

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
    await expect(nav.getByRole('link')).toHaveCount(5);
    if (width < 1280) {
      await expectNoSeriousA11yViolations(page);
      await capture(page, `mentor-home-menu-${width}`);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
    }
    expect(requests).toEqual([]);
  });
}

test('header links and mobile drawer retain visible keyboard focus with reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
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
  for (const [label] of NAVIGATION.slice(1)) {
    await page.keyboard.press('Tab');
    await expect(
      page
        .getByRole('navigation', { name: 'Main', exact: true })
        .getByRole('link', { name: label, exact: true }),
    ).toBeFocused();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const trigger = page.getByRole('button', { name: 'Open menu' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  for (let index = 0; index < 8; index++) {
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Tab');
  }
  await expectNoSeriousA11yViolations(page);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  expect(
    await page
      .locator('main')
      .evaluate(
        (el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
      ),
  ).toBe(0);
});

test('student sign-in, activation and direct staff sign-in retain existing routes', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Main', exact: true })
    .getByRole('link', { name: 'Student Sign in' })
    .click();
  await expect(page).toHaveURL(/\/student\/login$/);
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await page.goto('/');
  await page.getByRole('link', { name: 'Activate your account', exact: true }).click();
  await expect(page).toHaveURL(/\/student\/register$/);
  await expect(page.getByLabel('Activation code')).toBeVisible();
  await page.goto('/admin/login');
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
});

test('all verification destinations offer a real lookup with no Coming Soon claims', async ({
  page,
}) => {
  for (const [label, path] of NAVIGATION.slice(0, 4)) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: label })).toBeVisible();
    await expect(page.locator('main form')).toHaveCount(1);
    await expect(page.getByTestId('not-available')).toHaveCount(0);
  }
});

test('small-screen text and navigation remain readable at 200 percent text scale', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const title = page.getByRole('heading', { level: 1 });
  const normalSize = await title.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await expect
    .poll(() => title.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)))
    .toBeGreaterThan(normalSize);
  await expectNoHorizontalOverflow(page);
  const brokenWords = await page.locator('main h1').evaluateAll((elements) => {
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
  expect(
    await page.locator('main h1 [data-hero-word]').evaluateAll((words) =>
      words.every((word) => {
        const box = word.getBoundingClientRect();
        return box.left >= -1 && box.right <= innerWidth + 1;
      }),
    ),
  ).toBe(true);
  await expectNoSeriousA11yViolations(page);
  expect(
    await page
      .locator('header a[aria-label="Docversity home"] span')
      .evaluateAll((spans) => spans.some((span) => span.scrollWidth > span.clientWidth + 1)),
  ).toBe(false);
  await page.getByRole('button', { name: 'Open menu' }).click();
  const links = page.getByRole('navigation', { name: 'Mobile' }).getByRole('link');
  await expect(links).toHaveText(NAVIGATION.map(([label]) => label));
  expect(
    await links.evaluateAll((elements) =>
      elements.some(
        (el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
      ),
    ),
  ).toBe(false);
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
  await capture(page, 'mentor-home-text-scale-320');
});
test('desktop header uses the same five drawer links when text is enlarged', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Main', exact: true })).toBeVisible();
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await expect(page.getByRole('navigation', { name: 'Main', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('navigation', { name: 'Mobile' }).getByRole('link')).toHaveText(
    NAVIGATION.map(([label]) => label),
  );
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
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
