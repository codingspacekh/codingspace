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
  await expect(page.getByText('Write Cambridge 9618 pseudocode and watch it run')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Why Pseudocode Runner?',
    'Features',
    'Get started',
    'Questions',
    'Get Pseudocode Runner',
  ]);
  // Two downloads: the hero's button goes to them.
  await page.getByRole('link', { name: 'Download', exact: true }).click();
  await expect(page).toHaveURL(/#download$/);
  const get = page.getByRole('region', { name: 'Get Pseudocode Runner' });
  await expect(get.getByText('Free, version 0.9.0, for Windows, macOS.')).toBeVisible();
  await expect(get.getByRole('link', { name: 'Download for Windows' })).toHaveAttribute(
    'href',
    'https://example.com/downloads/pseudocode-runner-setup.exe',
  );
  await page.getByText('Does it work without the internet?').click();
  await expect(page.getByText('Once installed, it never needs a connection.')).toBeVisible();
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
  expect(ld).toMatchObject({ '@type': 'SoftwareApplication', name: 'Pseudocode Runner', softwareVersion: '0.9.0' });

  // A project with nothing to download yet.
  await page.goto('/projects');
  await expect(page.getByRole('link', { name: /Inequality Drills/ })).toContainText('Coming soon');
  await page.getByRole('link', { name: /Inequality Drills/ }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Inequality Drills is coming soon']);
  expect((await page.goto('/projects/no-such-project'))!.status()).toBe(404);
  expect(
    problems.filter((p) => !p.includes('404')),
    problems.join('\n'),
  ).toEqual([]);
});
