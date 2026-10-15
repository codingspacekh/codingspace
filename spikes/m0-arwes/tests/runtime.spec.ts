import { test, expect, type Page } from '@playwright/test';

/** Collects console errors, page errors, hydration warnings and CSP violations. */
async function watch(page: Page) {
  const problems: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      // eslint-disable-next-line no-console
      console.error(`CSP-VIOLATION ${e.violatedDirective} ${e.blockedURI} ${e.sample ?? ''}`);
    });
  });
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' || /hydrat/i.test(t)) problems.push(`[${m.type()}] ${t}`);
  });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  return problems;
}

for (const path of ['/', '/lesson']) {
  test(`${path} runs with no console errors, hydration warnings or CSP violations`, async ({ page }) => {
    const problems = await watch(page);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500); // let enter animations finish
    expect(problems, problems.join('\n')).toEqual([]);
  });
}

test('Arwes frame assembles into SVG paths', async ({ page }) => {
  await page.goto('/');
  const frame = page.locator('[data-testid="hero-card"] svg.arwes-frames-frame');
  await expect(frame).toHaveCount(1);
  await expect.poll(async () => frame.locator('path').count()).toBeGreaterThan(0);
});

test('decipher headline ends on the real text', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2500);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Prove it.');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Model it.');
});

test('GridLines and Dots backgrounds draw on canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid="backdrop"] canvas')).toHaveCount(2);
});

test('backdrop is not covered by an opaque body background', async ({ page }) => {
  await page.goto('/');
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bodyBg).toBe('rgba(0, 0, 0, 0)');
});

test('body text uses the brand font, not a fallback', async ({ page }) => {
  await page.goto('/');
  const family = await page.getByTestId('intro').evaluate((e) => getComputedStyle(e).fontFamily);
  expect(family).toMatch(/Titillium/i);
});

test('sound files are not downloaded until sound is turned on', async ({ page }) => {
  const audio: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/sounds/')) audio.push(r.url()); });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /sound/i }).hover();
  expect(audio).toEqual([]);

  await page.getByRole('button', { name: /sound/i }).click();
  await expect(page.getByRole('button', { name: /sound/i })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => audio.length).toBeGreaterThan(0);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('headline is fully visible immediately, no decipher', async ({ page }) => {
    await page.goto('/');
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toContainText('Prove it.', { timeout: 300 });
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  });
});
