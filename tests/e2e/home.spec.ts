import { test, expect } from '@playwright/test';
import { collectProblems, expectAccessible } from './helpers';

test('home renders the brand, tracks and latest lessons, and is accessible', async ({ page }) => {
  const problems = await collectProblems(page);
  await page.goto('/');
  await expect(page).toHaveTitle(/CodingSpace/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('My Love, Math.');
  const study = page.getByRole('region', { name: 'Study' });
  for (const subject of ['Math', 'Physics', 'Coding', 'IT']) {
    await expect(study.getByRole('link', { name: new RegExp(`^${subject}`) })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Latest lessons' })).toBeVisible();
  await page.waitForLoadState('load');
  await expectAccessible(page);
  expect(problems, problems.join('\n')).toEqual([]);
});

test('problem of the week hides the solution until asked', async ({ page }) => {
  await page.goto('/');
  const potw = page.getByRole('region', { name: 'Problem of the week' });
  await expect(potw.locator('.katex').first()).toBeVisible();
  const solution = potw.getByText('Show the solution');
  await expect(potw.getByText(/a\+b\+c/i).last()).toBeHidden();
  await solution.click();
  await expect(potw.locator('details[open]')).toHaveCount(1);
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
    await expect(page.getByRole('heading', { level: 1 })).toContainText('My Life, Code.');
    await expect(page.getByTestId('intro')).toBeVisible();
  });
});

test('unknown pages return the styled 404', async ({ page }) => {
  const res = await page.goto('/this-page-does-not-exist');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Signal lost');
  await expect(page.getByRole('link', { name: /back to home/i })).toBeVisible();
});

test('turning sound on loads the sound module without errors', async ({ page }) => {
  const problems = await collectProblems(page);
  await page.goto('/posts/linear-search');
  const burger = page.getByRole('button', { name: 'Menu' });
  if (await burger.isVisible()) await burger.click();
  // Listen before clicking: the module and the sound load within milliseconds of the click.
  const chime = page.waitForResponse((r) => r.url().endsWith('/sounds/intro.mp3') && r.ok());
  const sound = page.getByRole('button', { name: 'Sound', exact: true });
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await chime;
  expect(problems, problems.join('\n')).toEqual([]);
});
