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
  for (const path of [
    '/author',
    '/projects',
    '/projects/pseudocode-runner',
    '/projects/inequality-drills',
    '/posts/study-tips-km',
  ]) {
    await page.goto(path);
    await page.waitForLoadState('load');
    await expectAccessible(page);
  }
});

test('a project card opens its landing page here: intro, reasons, features, steps, FAQ, downloads (v1.1)', async ({
  page,
}) => {
  const problems = await collectProblems(page);
  await page.goto('/projects');
  await page.getByRole('link', { name: /Pseudocode Runner/ }).click();
  await expect(page).toHaveURL(/\/projects\/pseudocode-runner$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Pseudocode Runner/);
  // The tagline: under the name, and again in the closing call.
  await expect(page.getByText('Write Cambridge 9618 pseudocode and watch it run').first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Why Pseudocode Runner?',
    'Features',
    'Get Pseudocode Runner',
    'Install',
    'Questions',
    'Ready to try Pseudocode Runner?',
  ]);
  // 2026-10-20: the hero downloads directly; the sub-navigation (on screen while scrolling) leads to all of them.
  await expect(page.getByRole('link', { name: /^Download for Windows/ }).first()).toHaveAttribute(
    'href',
    'https://example.com/downloads/pseudocode-runner-setup.exe',
  );
  const nav = page.getByRole('navigation', { name: 'Pseudocode Runner: on this page' });
  await nav.locator('a.btn').click();
  await expect(page).toHaveURL(/#download$/);
  await expect(nav).toBeInViewport();
  const get = page.getByRole('region', { name: 'Get Pseudocode Runner' });
  await expect(get.getByText('Version 0.9.0')).toBeVisible();
  await expect(get.getByRole('link', { name: 'Download ↗ for macOS' })).toHaveAttribute(
    'href',
    'https://example.com/downloads/pseudocode-runner.dmg',
  );
  await page.getByText('Does it work without the internet?').click();
  await expect(page.getByText('Once installed, it never needs a connection.')).toBeVisible();
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
  expect(ld).toMatchObject({ '@type': 'SoftwareApplication', name: 'Pseudocode Runner', softwareVersion: '0.9.0' });

  // A project with nothing to download yet.
  await page.goto('/projects');
  await expect(page.getByRole('link', { name: /Inequality Drills/ })).toContainText('Coming soon');
  await page.getByRole('link', { name: /Inequality Drills/ }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Inequality Drills is coming soon',
    'Inequality Drills',
  ]);
  expect((await page.goto('/projects/no-such-project'))!.status()).toBe(404);
  expect(
    problems.filter((p) => !p.includes('404')),
    problems.join('\n'),
  ).toEqual([]);
});
