import { expect, test } from '@playwright/test';
import { collectProblems, expectAccessible } from './helpers';

// v1.1 lesson progress: "Mark as done" kept in this browser only (no sign-in, nothing sent).

test('mark a lesson as done → its section and subject show progress, after a reload too → undo', async ({
  page,
  context,
}) => {
  const problems = await collectProblems(page);
  const posted: string[] = [];
  page.on('request', (r) => {
    // GET and HEAD carry no body (Next checks a page's data with HEAD before a client navigation).
    if (!['GET', 'HEAD'].includes(r.method()) && !r.url().endsWith('/api/visit')) posted.push(r.url());
  });

  await page.goto('/posts/am-gm-inequality');
  const box = page.getByRole('region', { name: 'Your progress' });
  await box.getByRole('button', { name: 'Mark as done' }).click();
  await expect(box.getByRole('button', { name: '✓ Done' })).toHaveAttribute('aria-pressed', 'true');
  await expect(box.getByRole('status')).toContainText('Marked as done on this device.');
  await expectAccessible(page);

  await page.goto('/study/math');
  const section = page.getByRole('region', { name: 'Inequalities' });
  await expect(section.getByRole('progressbar', { name: 'Your progress in Inequalities' })).toHaveAttribute(
    'value',
    '1',
  );
  await expect(section.getByRole('link', { name: /The AM–GM inequality ?\(done\)/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('progressbar', { name: 'Your progress in Math' })).toBeVisible();
  await expectAccessible(page);

  await page.goto('/posts/am-gm-inequality');
  await box.getByRole('button', { name: '✓ Done' }).click();
  await page.goto('/study/math');
  await expect(page.getByRole('progressbar')).toHaveCount(0);

  expect(await context.cookies()).toEqual([]);
  expect(posted).toEqual([]);
  expect(problems).toEqual([]);
});
