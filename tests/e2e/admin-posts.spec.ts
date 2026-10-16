import { expect, request as playwrightRequest, test } from '@playwright/test';
import { EDITOR, resetUser, serviceClient, totp } from '../support/admin-users';
import { collectProblems, expectAccessible } from './helpers';

// M3 dashboard and posts list (03 ADM-02, ADM-03), signed in as a second allow-listed test
// account, so this file never touches the authenticator that admin-auth.spec.ts resets.

test.describe('dashboard and posts list', { tag: '@single-account' }, () => {
  test.describe.configure({ mode: 'serial' });
  let secret = '';

  // Enrol once, then each test signs its own page in with a code.
  test.beforeAll(async ({ baseURL }) => {
    await resetUser(serviceClient(), EDITOR);
    const api = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL! } });
    await api.post('/api/auth/sign-in', { data: { email: EDITOR.email, password: EDITOR.password } });
    secret = ((await (await api.post('/api/auth/mfa/enroll')).json()) as { secret: string }).secret;
    expect((await api.post('/api/auth/mfa/verify', { data: { code: totp(secret) } })).status()).toBe(200);
    await api.dispose();
  });

  test.beforeEach(async ({ page, baseURL }) => {
    const headers = { Origin: baseURL! };
    await page.request.post('/api/auth/sign-in', { headers, data: { email: EDITOR.email, password: EDITOR.password } });
    const verified = await page.request.post('/api/auth/mfa/verify', { headers, data: { code: totp(secret) } });
    expect(verified.status()).toBe(200);
  });

  test('the dashboard shows counts and creates a new lesson', async ({ page }) => {
    const problems = await collectProblems(page);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    // The imported content: 11 published posts, 2 of them life posts.
    await expect(page.getByRole('link', { name: /^\d+ Published$/ })).toBeVisible();
    await expect(page.getByRole('link', { name: '2 Life posts' })).toBeVisible();
    await expectAccessible(page);

    await page.getByRole('button', { name: 'New lesson' }).click();
    await expect(page).toHaveURL(/\/admin\/posts\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: 'Edit post' })).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('the list filters through the address bar, and deletes a draft after confirming', async ({ page }) => {
    const problems = await collectProblems(page);
    await page.goto('/admin/posts');
    await page.getByRole('combobox', { name: 'Subject' }).selectOption('physics');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page).toHaveURL(/\?subject=physics$/);
    const rows = page.getByRole('table').getByRole('row');
    await expect(rows.nth(1)).toBeVisible();
    for (const row of await rows.all()) {
      if ((await row.getByRole('columnheader').count()) === 0) await expect(row).toContainText('Physics');
    }
    await expectAccessible(page);

    // The draft from the previous test: the newest Untitled one.
    await page.goto('/admin/posts?status=draft&q=lesson');
    const draft = page.getByRole('row').filter({ hasText: 'Untitled' }).first();
    const slug = (await draft.locator('.adm-slug').first().textContent())!;
    await draft.getByRole('button', { name: /^Delete / }).click();
    await page.getByRole('button', { name: 'Delete permanently' }).click();
    await expect(page.getByRole('status')).toHaveText('Deleted “' + slug.replace('/posts/', '') + '”.');
    await expect(page.getByText(slug, { exact: true })).toHaveCount(0);
    expect(problems).toEqual([]);
  });
});
