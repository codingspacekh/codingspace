import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function collectProblems(page: Page) {
  const problems: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      console.error(`CSP-VIOLATION ${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  page.on('console', (m) => {
    if (m.type() === 'error' || /hydrat/i.test(m.text())) problems.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  return problems;
}

test('home renders the brand and is accessible', async ({ page }) => {
  const problems = await collectProblems(page);
  await page.goto('/');
  await expect(page).toHaveTitle(/CodingSpace/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Prove it.');
  await expect(page.getByRole('main')).toBeVisible();
  await page.waitForLoadState('networkidle');
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  expect(problems, problems.join('\n')).toEqual([]);
});

test('skip link moves keyboard focus to main content', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await skip.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('content is readable from the server HTML', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Code it.');
    await expect(page.getByTestId('intro')).toBeVisible();
  });
});

test('unknown pages return the styled 404', async ({ page }) => {
  const res = await page.goto('/this-page-does-not-exist');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Signal lost');
  await expect(page.getByRole('link', { name: /back to home/i })).toBeVisible();
});
