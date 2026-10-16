import { expect, test } from '@playwright/test';
import { collectProblems, enrolEditor, expectAccessible, signInEditor } from './helpers';

// M5 site content (03 ADM-11, ADM-13, ADM-14), as the second test owner. Runs in its own
// Playwright project after the public-page tests, and leaves the content as it found it.

test.describe('site content', { tag: '@single-account' }, () => {
  test.describe.configure({ mode: 'serial' });
  let secret = '';

  test.beforeAll(async ({ baseURL }) => {
    secret = await enrolEditor(baseURL!);
  });
  test.beforeEach(async ({ page, baseURL }) => {
    await signInEditor(page, baseURL!, secret);
  });

  test('projects: add one, feature it → Projects and Home show it first; then put things back', async ({
    page,
    context,
    baseURL,
  }) => {
    const problems = await collectProblems(page);
    const name = `E2E project ${Date.now()}`;
    const origin = { Origin: baseURL! };
    const before = (await (await page.request.get('/api/admin/projects')).json()).projects as {
      id: string;
      name: string;
      is_featured: boolean;
    }[];

    await page.goto('/admin/projects');
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    const form = page.getByRole('form', { name: 'Add a project' });
    await form.getByRole('textbox', { name: 'Name' }).fill(name);
    await form.getByRole('textbox', { name: 'Short description' }).fill('Made by the end-to-end test.');
    await form.getByRole('textbox', { name: 'Landing page' }).fill('http://insecure.example');
    await form.getByRole('button', { name: 'Add project' }).click();
    await expect(form.getByRole('alert')).toContainText('https://');
    await form.getByRole('textbox', { name: 'Landing page' }).fill('https://example.com/e2e-project');
    await form.getByRole('button', { name: 'Add project' }).click();
    await expect(page.getByRole('status')).toHaveText(`Added “${name}” at the end.`);
    await page.getByRole('button', { name: `Feature ${name}` }).click();
    await expect(page.getByRole('status')).toHaveText(`“${name}” is now the featured project.`);
    await expectAccessible(page);

    const student = await (await context.browser()!.newContext({ baseURL })).newPage();
    await student.goto('/projects');
    await expect(student.locator('main a[target="_blank"]').first()).toContainText(name);
    await student.goto('/');
    await expect(student.locator('main').getByRole('link', { name: new RegExp(name) })).toBeVisible();

    // Put things back: the original featured project, without ours.
    const featured = before.find((p) => p.is_featured);
    await page.request.put('/api/admin/projects/featured', { headers: origin, data: { id: featured?.id ?? null } });
    await page.reload();
    await page.getByRole('button', { name: `Delete ${name}` }).click();
    await page.getByRole('button', { name: 'Delete permanently' }).click();
    await expect(page.getByRole('status')).toHaveText(`Deleted “${name}”.`);
    await student.goto('/projects');
    await expect(student.getByText(name)).toHaveCount(0);
    await student.context().close();
    expect(problems).toEqual([]);
  });

  test('author: edit the bio and add a timeline entry → the Author page shows them; then put them back', async ({
    page,
    context,
    baseURL,
  }) => {
    const problems = await collectProblems(page);
    const original = await (await page.request.get('/api/admin/author')).json();
    const marker = `E2E ${Date.now()}`;

    await page.goto('/admin/author');
    const bio = page.getByRole('textbox', { name: 'About you' });
    await bio.fill(`${original.profile.bio} ${marker}`);
    await page.getByRole('button', { name: 'Add an entry' }).click();
    const n = original.timeline.length + 1;
    await page.getByRole('textbox', { name: `Year of entry ${n}` }).fill('2030');
    await page.getByRole('textbox', { name: `What happened, entry ${n}` }).fill(`Timeline ${marker}`);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status')).toHaveText('Saved. The Author page is updated.');
    await expectAccessible(page);

    const student = await (await context.browser()!.newContext({ baseURL })).newPage();
    await student.goto('/author');
    await expect(student.getByText(marker, { exact: false }).first()).toBeVisible();
    await expect(student.getByText(`Timeline ${marker}`)).toBeVisible();

    const put = await page.request.put('/api/admin/author', { headers: { Origin: baseURL! }, data: original });
    expect(put.status()).toBe(200);
    await student.goto('/author');
    await expect(student.getByText(marker)).toHaveCount(0);
    await student.context().close();
    expect(problems).toEqual([]);
  });
});
