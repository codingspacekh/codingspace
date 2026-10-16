import { test, expect } from '@playwright/test';
import { collectProblems, expectAccessible, openStudyMenu } from './helpers';

// 04 M2: Home → Study ▾ → Math → Inequalities → lesson → Next lesson.
test('a student can go from Home to a lesson and on to the next one', async ({ page }) => {
  const problems = await collectProblems(page);
  await page.goto('/');

  await openStudyMenu(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Math/ }).click();
  await expect(page).toHaveURL(/\/study\/math$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Math' })).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: /Inequalities/ })
    .click();
  await expect(page).toHaveURL(/#inequalities$/);
  await page.getByRole('link', { name: /The AM–GM inequality/ }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'The AM–GM inequality' })).toBeVisible();
  await expect(page.getByRole('article').locator('.katex').first()).toBeVisible();

  await page
    .getByRole('navigation', { name: 'More lessons in this section' })
    .getByRole('link', { name: /Next/ })
    .click();
  await expect(page).toHaveURL(/\/posts\/cauchy-schwarz-inequality$/);
  await expect(page.getByRole('heading', { level: 1, name: 'The Cauchy–Schwarz inequality' })).toBeVisible();
  expect(problems, problems.join('\n')).toEqual([]);
});

for (const path of ['/study/math', '/study/it', '/posts/am-gm-inequality', '/posts/linear-search']) {
  test(`${path} is accessible and error-free`, async ({ page }) => {
    const problems = await collectProblems(page);
    await page.goto(path);
    await page.waitForLoadState('load');
    await expectAccessible(page);
    expect(problems, problems.join('\n')).toEqual([]);
  });
}

test('maths pages load KaTeX CSS from our origin; pages without maths do not', async ({ page }) => {
  await page.goto('/posts/am-gm-inequality');
  await expect(page.locator('link[href="/katex/katex.min.css"]')).toHaveCount(1);
  await page.goto('/posts/network-topologies');
  await expect(page.locator('link[href="/katex/katex.min.css"]')).toHaveCount(0);
});

test('code blocks have a working copy button', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/posts/linear-search');
  const python = page.locator('figure.code[data-lang="python"]');
  await python.getByRole('button', { name: 'Copy' }).click();
  await expect(python.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('def linear_search');
});

test('tables render with a header row', async ({ page }) => {
  await page.goto('/posts/variables-and-types');
  const table = page.getByRole('table');
  await expect(table.getByRole('columnheader', { name: 'Type' })).toBeVisible();
  await expect(table.getByRole('cell', { name: 'int' })).toBeVisible();
});

test('an unknown lesson returns 404', async ({ page }) => {
  const res = await page.goto('/posts/no-such-lesson');
  expect(res?.status()).toBe(404);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('a lesson is fully readable, maths included', async ({ page }) => {
    await page.goto('/posts/am-gm-inequality');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The AM–GM inequality');
    await expect(page.getByRole('heading', { name: 'Proof' })).toBeVisible();
    await expect(page.locator('.katex').first()).toBeVisible();
  });
});
