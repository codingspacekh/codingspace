import { expect, test } from '@playwright/test';
import { collectProblems, expectAccessible } from './helpers';

// Save for later: kept in this browser only (no sign-in, no cookie, nothing sent to the server).

test('save a lesson → it is on the Saved page after a reload → remove it', async ({ page, context }) => {
  const problems = await collectProblems(page);
  const posted: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && !r.url().endsWith('/api/visit')) posted.push(r.url());
  });

  await page.goto('/posts/projectile-motion');
  await page.getByRole('button', { name: '☆ Save' }).click();
  await expect(page.getByRole('button', { name: '★ Saved' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this device.' })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('link', { name: 'Your saved lessons' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Saved lessons' })).toBeVisible();
  await page.reload();
  const list = page.getByRole('list', { name: 'Your saved lessons' });
  await expect(list.getByRole('link', { name: 'Projectile motion' })).toHaveAttribute(
    'href',
    '/posts/projectile-motion',
  );
  await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(1);
  await expectAccessible(page);

  await list.getByRole('button', { name: 'Remove Projectile motion' }).click();
  await expect(page.getByText(/Nothing saved yet/)).toBeVisible();
  await page.goto('/posts/projectile-motion');
  await expect(page.getByRole('button', { name: '☆ Save' })).toHaveAttribute('aria-pressed', 'false');

  expect(await context.cookies()).toEqual([]);
  expect(posted).toEqual([]);
  expect(problems).toEqual([]);
});
