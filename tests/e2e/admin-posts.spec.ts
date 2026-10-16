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
    // Only the header row lacks "Physics" once the filtered list has loaded.
    const rows = page.getByRole('table').getByRole('row');
    await expect(rows.nth(1)).toBeVisible();
    await expect(rows.filter({ hasNotText: 'Physics' })).toHaveCount(1);
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

  test('the editor: title, text, a maths block from the "/" menu, a section; autosaved and still there after reload', async ({
    page,
  }) => {
    const problems = await collectProblems(page);
    const title = `E2E editor ${Date.now()}`;
    await page.goto('/admin');
    await page.getByRole('button', { name: 'New lesson' }).click();
    await expect(page.getByRole('textbox', { name: 'Body' })).toBeVisible();

    await page.getByRole('textbox', { name: 'Title' }).fill(title);
    await page.getByRole('textbox', { name: 'Body' }).click();
    await page.keyboard.type('For positive reals:');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/math');
    await expect(page.getByRole('listbox', { name: 'Insert a block' })).toBeVisible();
    await page.keyboard.press('Enter');
    const latex = page.getByLabel('Maths block (LaTeX)');
    await latex.fill('\\frac{a+b}{2} \\ge \\sqrt{ab}');
    await expect(page.getByRole('img', { name: 'Preview' }).locator('.katex')).toBeVisible();

    const section = page.getByRole('combobox', { name: 'Section' });
    await section.selectOption({ index: 1 });
    const sectionId = await section.inputValue();
    await expect(page.getByRole('status').filter({ hasText: 'Unsaved changes' })).toBeVisible();
    await expectAccessible(page);

    // No Save click: autosave (03 ADM-06) stores it a second after the last edit.
    await expect(page.getByText('All changes saved')).toBeVisible();
    const slug = title.toLowerCase().replace(/\s+/g, '-');
    await expect(page.getByText(`codingspace.io/posts/${slug}`)).toBeVisible();

    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue(title);
    await expect(page.getByRole('textbox', { name: 'Body' })).toContainText('For positive reals:');
    await expect(page.getByLabel('Maths block (LaTeX)')).toHaveValue('\\frac{a+b}{2} \\ge \\sqrt{ab}');
    await expect(page.getByRole('combobox', { name: 'Section' })).toHaveValue(sectionId);
    expect(problems).toEqual([]);

    // History: rename, let it autosave, then restore the first version.
    await page.getByRole('textbox', { name: 'Title' }).fill(`${title} (renamed)`);
    await expect(page.getByText('All changes saved')).toBeVisible();
    await page.getByRole('button', { name: 'History' }).click();
    const history = page.getByRole('region', { name: 'History' });
    await history.getByRole('button', { name: new RegExp(`Autosaved\\s*${title}$`) }).click();
    await expect(history.getByText('For positive reals:')).toBeVisible();
    await history.getByRole('button', { name: 'Restore…' }).click();
    await history.getByRole('button', { name: 'Restore this version' }).click();
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue(title);
    await expect(page.getByRole('alert').filter({ hasText: 'Restored.' })).toBeVisible();
    await expectAccessible(page);
    expect(problems).toEqual([]);

    const id = page.url().split('/').pop()!;
    expect(
      (
        await page.request.delete(`/api/admin/posts/${id}`, { headers: { Origin: new URL(page.url()).origin } })
      ).status(),
    ).toBe(200);
  });

  // The M3 acceptance journey (04-milestones): write with maths and code → Preview → Publish →
  // the lesson appears in its section and in Latest lessons within 10 s. Then schedule it.
  test('acceptance: write, preview, publish, live within 10 s; unpublish; schedule', async ({
    page,
    context,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    const problems = await collectProblems(page);
    const title = `E2E publish ${Date.now()}`;
    const slug = title.toLowerCase().replace(/\s+/g, '-');
    await page.goto('/admin');
    await page.getByRole('button', { name: 'New lesson' }).click();
    await page.getByRole('textbox', { name: 'Title' }).fill(title);
    await page.getByRole('textbox', { name: 'Body' }).click();
    await page.keyboard.type('Run this, then prove the bound.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/code');
    await page.keyboard.press('Enter');
    await page.keyboard.type('print(42)');
    // Three Enters leave a code block.
    for (let i = 0; i < 3; i++) await page.keyboard.press('Enter');
    await page.keyboard.type('/maths b');
    await page.keyboard.press('Enter');
    await page.getByLabel('Maths block (LaTeX)').fill('a^2 + b^2 \\ge 2ab');
    const section = page.getByRole('combobox', { name: 'Section' });
    await section.selectOption({ index: 1 });
    const sectionTitle = (await section.locator('option:checked').textContent())!;
    await expect(page.getByText('All changes saved')).toBeVisible();

    // Preview: a new tab, the draft exactly as students would see it.
    const [preview] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Preview' }).click(),
    ]);
    await expect(preview.getByRole('note')).toContainText('students can’t see this page');
    await expect(preview.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(preview.locator('.prose .katex')).toBeVisible();
    await expect(preview.locator('.prose pre')).toContainText('print(42)');
    await expect(preview.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(sectionTitle);
    await preview.close();

    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const started = Date.now();
    await page.getByRole('button', { name: 'Publish now' }).click();
    await expect(page.getByText('Published. The site is updated.')).toBeVisible();

    const visitor = await context.browser()!.newContext({ baseURL });
    const student = await visitor.newPage();
    const showsUp = async (path: string, where: (p: typeof student) => ReturnType<typeof student.locator>) =>
      expect
        .poll(
          async () => {
            await student.goto(path);
            return where(student)
              .getByRole('link', { name: new RegExp(title) })
              .count();
          },
          { timeout: 10_000 },
        )
        .toBeGreaterThan(0);
    await showsUp('/study/math', (p) => p.locator('main'));
    await showsUp('/', (p) => p.getByRole('region', { name: 'Latest lessons' }));
    expect(Date.now() - started).toBeLessThan(10_000);
    await student.goto(`/posts/${slug}`);
    await expect(student.getByRole('heading', { level: 1, name: title })).toBeVisible();

    // Unpublish: the page is gone for students.
    await page.getByRole('button', { name: 'Unpublish…' }).click();
    await page.getByRole('group', { name: 'Confirm unpublish' }).getByRole('button', { name: 'Unpublish' }).click();
    await expect(page.getByText(/Unpublished: students no longer see it/)).toBeVisible();
    expect((await student.goto(`/posts/${slug}`))!.status()).toBe(404);

    // Schedule, then let the timer publish it (the time is moved into the past instead of waiting).
    const later = new Date(Date.now() + 2 * 3600_000);
    const local = new Date(later.getTime() - later.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    await page.getByLabel('Or publish later').fill(local);
    await page.getByRole('button', { name: 'Schedule' }).click();
    await expect(page.getByText(/^Scheduled for/)).toBeVisible();
    if (process.env.CRON_SECRET) {
      const id = page.url().split('/').pop()!;
      await serviceClient()
        .from('posts')
        .update({ scheduled_at: new Date(Date.now() - 1000).toISOString() })
        .eq('id', id);
      const cron = await page.request.get('/api/cron/publish-due', {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
      expect(await cron.json()).toMatchObject({ published: [slug] });
      expect((await student.goto(`/posts/${slug}`))!.status()).toBe(200);
    }
    await visitor.close();
    expect(problems).toEqual([]);

    const id = page.url().split('/').pop()!;
    await page.request.delete(`/api/admin/posts/${id}`, { headers: { Origin: baseURL! } });
  });

  test('the timer endpoint refuses calls without the secret', async ({ request }) => {
    const res = await request.get('/api/cron/publish-due');
    expect([401, 503]).toContain(res.status());
  });
});
