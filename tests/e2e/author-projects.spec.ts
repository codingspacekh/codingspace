import { test, expect } from '@playwright/test';
import { collectProblems, expectAccessible } from './helpers';

test('Author shows the profile, timeline and life posts, Khmer included', async ({ page }) => {
  const problems = await collectProblems(page);
  await page.goto('/author');
  await expect(page.getByRole('heading', { level: 1, name: 'CodingSpace' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();
  const life = page.getByRole('region', { name: 'Life posts' });
  await expect(life.getByRole('link', { name: /Why I started CodingSpace/ })).toBeVisible();
  const khmer = life.getByRole('link', { name: /គន្លឹះសិក្សាសម្រាប់សិស្ស/ });
  await expect(khmer).toHaveAttribute('lang', 'km');

  await khmer.click();
  await expect(page.getByRole('article')).toHaveAttribute('lang', 'km');
  await expect(
    page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Author' }),
  ).toBeVisible();
  expect(problems, problems.join('\n')).toEqual([]);
});

test('Author and Projects are accessible', async ({ page }) => {
  for (const path of ['/author', '/projects', '/posts/study-tips-km']) {
    await page.goto(path);
    await page.waitForLoadState('load');
    await expectAccessible(page);
  }
});

test('a project card opens the project site in a new tab', async ({ page, context }) => {
  // Keep the test offline: answer for the external site instead of visiting it.
  await context.route('https://example.com/**', (route) => route.fulfill({ body: 'project site' }));
  await page.goto('/projects');
  const card = page.getByRole('link', { name: /Pseudocode Runner/ });
  await expect(card).toHaveAttribute('target', '_blank');
  await expect(card).toHaveAttribute('rel', 'noopener noreferrer');
  const [tab] = await Promise.all([context.waitForEvent('page'), card.click()]);
  await expect(tab).toHaveURL('https://example.com/pseudocode-runner');
});
