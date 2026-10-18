import { expect, test } from '@playwright/test';
import sharp from 'sharp';
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

  test('author: edit the bio, add entries, hide the email → the Author page shows exactly that; then put it back', async ({
    page,
    context,
    baseURL,
  }) => {
    const problems = await collectProblems(page);
    const original = await (await page.request.get('/api/admin/author')).json();
    const marker = `E2E ${Date.now()}`;

    await page.goto('/admin/author');
    const bio = page.getByRole('textbox', { name: 'About you' });
    await bio.fill(`${original.profile.bio}\n\n**${marker}**`);
    await expect(page.getByRole('region', { name: 'Bio preview' }).locator('strong')).toHaveText(marker);
    await page.getByRole('checkbox', { name: 'Show the email' }).uncheck();

    const timeline = page.getByRole('group', { name: 'Timeline' });
    await timeline.getByRole('button', { name: 'Add an entry' }).click();
    await timeline.getByRole('textbox', { name: 'Year' }).last().fill('2030');
    await timeline.getByRole('textbox', { name: 'What happened' }).last().fill(`Timeline ${marker}`);
    const education = page.getByRole('group', { name: 'Education' });
    await education.getByRole('button', { name: 'Add a qualification' }).click();
    await education.getByRole('textbox', { name: 'Qualification' }).fill(`Degree ${marker}`);
    await education.getByRole('textbox', { name: 'School or university' }).fill('E2E University');
    await page.getByRole('button', { name: 'Add a custom section' }).click();
    const custom = page.getByRole('group', { name: 'Custom section 1' });
    await custom.getByRole('textbox', { name: 'Heading' }).fill(`Hidden ${marker}`);
    await custom.getByRole('button', { name: 'Add an item' }).click();
    await custom.getByRole('textbox', { name: 'Item' }).fill('Not for visitors');
    await custom.getByRole('checkbox', { name: 'Show this section' }).uncheck();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status').last()).toHaveText('Saved. The Author page is updated.');
    await expectAccessible(page);

    const student = await (await context.browser()!.newContext({ baseURL })).newPage();
    await student.goto('/author');
    await expect(student.locator('.profile strong')).toHaveText(marker);
    await expect(student.getByText(`Timeline ${marker}`)).toBeVisible();
    const studies = student.getByRole('region', { name: 'Education' });
    await expect(studies.getByRole('heading', { level: 3, name: `Degree ${marker}` })).toBeVisible();
    await expect(studies).toContainText('E2E University');
    // Hidden parts are not in the page at all, not just out of sight.
    const html = await student.content();
    expect(html).not.toContain(original.profile.email || 'never-in-the-page');
    expect(html).not.toContain(`Hidden ${marker}`);
    expect(html).not.toContain('Not for visitors');
    await expectAccessible(student);

    const put = await page.request.put('/api/admin/author', { headers: { Origin: baseURL! }, data: original });
    expect(put.status()).toBe(200);
    await student.goto('/author');
    await expect(student.getByText(marker)).toHaveCount(0);
    await student.context().close();
    expect(problems).toEqual([]);
  });

  // The M5 acceptance check (04-milestones): change the problem of the week → Home and Math show it.
  test('problem of the week: write one with a live preview, show it → Home and Math show it; then put it back', async ({
    page,
    context,
    baseURL,
  }) => {
    const problems = await collectProblems(page);
    const origin = { Origin: baseURL! };
    const marker = `E2E${Date.now()}`;
    const before = (await (await page.request.get('/api/admin/problems')).json()).problems as {
      id: string;
      subject_id: string;
      is_current: boolean;
    }[];

    await page.goto('/admin/problems');
    await page.getByRole('button', { name: 'New problem' }).click();
    const form = page.getByRole('form', { name: 'New problem' });
    await form.getByRole('textbox', { name: 'Problem' }).fill(`${marker}: show that $x^2 + 1 > 0$ for every real $x$.`);
    await form.getByRole('textbox', { name: 'Hint (optional)' }).fill('Squares are never negative.');
    const preview = page.getByRole('region', { name: 'Preview' });
    await expect(preview.locator('.katex').first()).toBeVisible();
    await expectAccessible(page);
    await form.getByRole('button', { name: 'Add problem' }).click();
    await expect(page.getByRole('status')).toHaveText('Added, and showing it as the Math problem of the week.');

    const student = await (await context.browser()!.newContext({ baseURL })).newPage();
    for (const path of ['/', '/study/math']) {
      await student.goto(path);
      const potw = student.getByRole('region', { name: 'Problem of the week' });
      await expect(potw).toContainText(marker);
      await expect(potw.locator('.katex').first()).toBeVisible();
      await expect(potw.getByText('Squares are never negative.')).toBeHidden();
      await potw.getByText('Show a hint').click();
      await expect(potw.getByText('Squares are never negative.')).toBeVisible();
    }

    // Put back the problem that was showing, and remove ours.
    const mine = (
      (await (await page.request.get('/api/admin/problems')).json()).problems as { id: string; statement: string }[]
    ).find((p) => p.statement.startsWith(marker))!;
    const was = before.find((p) => p.subject_id === 'math' && p.is_current);
    if (was) await page.request.patch(`/api/admin/problems/${was.id}`, { headers: origin, data: { current: true } });
    expect((await page.request.delete(`/api/admin/problems/${mine.id}`, { headers: origin })).status()).toBe(200);
    await student.goto('/');
    await expect(student.getByText(marker)).toHaveCount(0);
    await student.context().close();
    expect(problems).toEqual([]);
  });

  test('author photo: upload it, save → the Author page shows it instead of the initials; then put it back', async ({
    page,
    context,
    baseURL,
  }) => {
    test.skip(!process.env.NEXT_PUBLIC_MEDIA_BASE_URL, 'uploads need a media store (see README "Media (R2)")');
    const problems = await collectProblems(page);
    const origin = { Origin: baseURL! };
    const original = await (await page.request.get('/api/admin/author')).json();

    await page.goto('/admin/author');
    const photo = page.getByRole('group', { name: 'Photo' });
    const png = await sharp({
      create: { width: 600, height: 600, channels: 3, background: { r: 40, g: (Date.now() % 200) + 30, b: 200 } },
    })
      .png()
      .toBuffer();
    await page.getByLabel('Upload a photo').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png });
    await expect(photo.getByRole('status')).toHaveText('Photo ready. Save to show it on the Author page.');
    await expect(photo.getByRole('img')).toHaveJSProperty('complete', true);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status').last()).toHaveText('Saved. The Author page is updated.');
    await expectAccessible(page);

    const student = await (await context.browser()!.newContext({ baseURL })).newPage();
    await student.goto('/author');
    const img = student.locator('.profile .avatar picture img');
    await expect(img).toHaveAttribute('alt', original.profile.name);
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
    await expect(student.locator('.profile .avatar span')).toHaveCount(0);

    // Put the profile back, then remove the uploaded photo from the library.
    const saved = await (await page.request.get('/api/admin/author')).json();
    expect((await page.request.put('/api/admin/author', { headers: origin, data: original })).status()).toBe(200);
    expect((await page.request.delete(`/api/admin/media/${saved.photo.id}`, { headers: origin })).status()).toBe(200);
    await student.goto('/author');
    await expect(student.locator('.profile .avatar picture')).toHaveCount(0);
    await student.context().close();
    expect(problems).toEqual([]);
  });

  test('analytics: a student reads a lesson → the owner sees it among the most read', async ({
    page,
    context,
    baseURL,
  }) => {
    const problems = await collectProblems(page);
    // A student's phone, without cookies: a fresh context, not the signed-in one.
    const student = await (
      await context.browser()!.newContext({
        baseURL,
        // A headless browser's own user agent counts as a robot.
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      })
    ).newPage();
    const counted = student.waitForResponse((r) => r.url().endsWith('/api/visit') && r.request().method() === 'POST');
    await student.goto('/posts/am-gm-inequality');
    expect((await counted).status()).toBe(204);
    const cookies = await student.context().cookies();
    const stored = await student.evaluate(() => Object.keys(localStorage).filter((k) => k !== 'cs-prefs'));
    expect({ cookies, stored }).toEqual({ cookies: [], stored: [] });
    await student.context().close();

    await page.goto('/admin/analytics');
    await expect(page.getByRole('heading', { level: 1, name: 'Analytics' })).toBeVisible();
    await page.getByRole('button', { name: 'Last 7 days' }).click();
    await expect(page.getByRole('button', { name: 'Last 7 days' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('link', { name: 'The AM–GM inequality' })).toHaveAttribute(
      'href',
      '/posts/am-gm-inequality',
    );
    await expect(page.getByRole('region', { name: 'Subjects' })).toContainText('Math');
    await expectAccessible(page);
    expect(problems).toEqual([]);
  });
});
