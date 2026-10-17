import { expect, test } from '@playwright/test';
import { collectProblems, expectAccessible } from './helpers';

// 03 PUB-09: search from the top bar; title matches first; matches highlighted; no JavaScript needed.

test('search from the top bar: results with highlighted matches, accessible', async ({ page }) => {
  const problems = await collectProblems(page);
  await page.goto('/');
  const burger = page.getByRole('button', { name: 'Menu' });
  if (await burger.isVisible()) await burger.click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Search' }).click();
  await expect(page).toHaveURL(/\/search$/);
  await page.getByRole('searchbox', { name: 'Search lessons' }).fill('cauchy');
  // With JavaScript, searching is a page change inside the site (skeleton, no reload).
  await page.evaluate(() => ((window as unknown as { same: boolean }).same = true));
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByTestId('page-skeleton')).toBeVisible();
  await expect(page).toHaveURL(/\/search\?q=cauchy$/);
  expect(await page.evaluate(() => (window as unknown as { same?: boolean }).same)).toBe(true);
  await expect(page.getByRole('status')).toContainText('for “cauchy”');
  const results = page.getByRole('list', { name: 'Results' }).getByRole('listitem');
  await expect(results.first().getByRole('heading')).toHaveText('The Cauchy–Schwarz inequality');
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/);
  await expectAccessible(page);
  await results.first().getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1, name: 'The Cauchy–Schwarz inequality' })).toBeVisible();

  // A word from the body is highlighted in the snippet.
  await page.goto('/search?q=quadratic');
  await expect(page.locator('.snippet mark').first()).toHaveText(/quadratic/i);
  expect(problems, problems.join('\n')).toEqual([]);
});

test('a search with no results says so', async ({ page }) => {
  await page.goto('/search?q=zzzz-no-such-word');
  await expect(page.getByRole('status')).toHaveText(
    'Nothing found for “zzzz-no-such-word”. Try fewer or shorter words.',
  );
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('the search form still works', async ({ page }) => {
    await page.goto('/search');
    await page.getByRole('searchbox', { name: 'Search lessons' }).fill('ineq');
    await page.getByRole('searchbox', { name: 'Search lessons' }).press('Enter');
    await expect(page.getByRole('list', { name: 'Results' }).getByRole('link', { name: /AM–GM/ })).toBeVisible();
  });
});
