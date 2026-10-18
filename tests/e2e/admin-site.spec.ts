import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { serviceClient } from '../support/admin-users';
import { collectProblems, enrolEditor, expectAccessible, openStudyMenu, signInEditor } from './helpers';

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
    await form.getByRole('textbox', { name: /Short description/ }).fill('Made by the end-to-end test.');
    // v1.1: the page is ours; a download link must be https.
    await form.locator('summary', { hasText: 'Why use it' }).click();
    await form.getByRole('button', { name: 'Add a reason' }).click();
    await form.getByRole('textbox', { name: 'Title' }).fill('Tested end to end');
    await form.locator('summary', { hasText: 'Download' }).click();
    await form.getByRole('button', { name: 'Add a download' }).click();
    await form.getByRole('textbox', { name: /^For/ }).fill('Windows');
    await form.getByRole('textbox', { name: 'Link' }).fill('http://insecure.example/app.exe');
    await form.getByRole('button', { name: 'Add project' }).click();
    await expect(form.getByRole('alert')).toContainText('https://');
    await form.getByRole('textbox', { name: 'Link' }).fill('https://example.com/e2e-project.exe');
    await form.getByRole('button', { name: 'Add project' }).click();
    // The page's own message (the screenshot uploader has one too).
    const status = page.locator('.adm-main > .adm-live');
    await expect(status).toHaveText(`Added “${name}” at the end.`);
    await page.getByRole('button', { name: `Feature ${name}` }).click();
    await expect(status).toHaveText(`“${name}” is now the featured project.`);
    await expectAccessible(page);

    const student = await (await context.browser()!.newContext({ baseURL })).newPage();
    await student.goto('/projects');
    await expect(student.locator('main a.proj').first()).toContainText(name);
    await student.locator('main a.proj').first().click();
    await expect(student.getByRole('heading', { level: 1 })).toContainText(name);
    await expect(student.getByRole('heading', { name: 'Tested end to end' })).toBeVisible();
    await expect(student.getByRole('link', { name: 'Download for Windows' }).first()).toHaveAttribute(
      'href',
      'https://example.com/e2e-project.exe',
    );
    await student.goto('/');
    await expect(student.locator('main').getByRole('link', { name: new RegExp(name) })).toBeVisible();

    // Put things back: the original featured project, without ours.
    const featured = before.find((p) => p.is_featured);
    await page.request.put('/api/admin/projects/featured', { headers: origin, data: { id: featured?.id ?? null } });
    await page.reload();
    await page.getByRole('button', { name: `Delete ${name}` }).click();
    await page.getByRole('button', { name: 'Delete permanently' }).click();
    await expect(status).toHaveText(`Deleted “${name}”.`);
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

  test('series: build one across two subjects → its page, the Study menu and each lesson show it; then delete it', async ({
    page,
    context,
    baseURL,
  }) => {
    const problems = await collectProblems(page);
    const title = `E2E series ${Date.now()}`;
    await page.goto('/admin/series');
    await expect(page.getByRole('heading', { level: 1, name: 'Series' })).toBeVisible();
    const form = page.getByRole('form', { name: 'Add a series' });
    await form.getByRole('textbox', { name: 'Title' }).fill(title);
    const pick = form.getByRole('combobox', { name: 'Add a lesson' });
    for (const lesson of ['Projectile motion', 'The AM–GM inequality']) {
      await pick.selectOption({ label: lesson });
      await form.getByRole('button', { name: 'Add to the series' }).click();
    }
    // The maths first, then the physics that uses it.
    await form.getByRole('button', { name: 'Move The AM–GM inequality up' }).click();
    await form.getByRole('button', { name: 'Add series' }).click();
    await expect(page.getByRole('status')).toHaveText(`Added “${title}” at the end.`);
    await expectAccessible(page);
    const created = (
      (await (await page.request.get('/api/admin/series')).json()).series as {
        slug: string;
        title: string;
        id: string;
      }[]
    ).find((s) => s.title === title)!;

    const student = await (await context.browser()!.newContext({ baseURL })).newPage();
    const studentProblems = await collectProblems(student);
    await student.goto('/');
    await openStudyMenu(student);
    await student.getByRole('link', { name: /^Series Lessons from across subjects/ }).click();
    await expect(student.getByRole('heading', { level: 1, name: 'Series' })).toBeVisible();
    await student.getByRole('link', { name: new RegExp(title) }).click();
    await expect(student.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(student.getByRole('list', { name: `${title}, in order` }).getByRole('link')).toHaveText([
      /The AM–GM inequality/,
      /Projectile motion/,
    ]);
    await expectAccessible(student);
    await student.getByRole('link', { name: 'Start with part 1 →' }).click();
    const box = student.getByRole('navigation', { name: `Series: ${title}` });
    await expect(box).toContainText('Part 1 of 2');
    await box.getByRole('link', { name: /Next → · Physics/ }).click();
    await expect(student.getByRole('heading', { level: 1, name: 'Projectile motion' })).toBeVisible();
    await expect(student.getByText(`Part 2 of 2 in the series ${title}`)).toBeVisible();
    await expectAccessible(student);

    // Delete it: its page goes, the lessons stay.
    await page.getByRole('button', { name: `Delete ${title}` }).click();
    await page.getByRole('button', { name: 'Delete series' }).click();
    await expect(page.getByRole('status')).toHaveText(`Deleted “${title}”.`);
    expect((await student.goto(`/series/${created.slug}`))!.status()).toBe(404);
    await student.context().close();
    expect(problems).toEqual([]);
    expect(studentProblems.filter((p) => !p.includes('404'))).toEqual([]);
  });

  test('subjects: add one hidden → visitors see nothing; show it → menus, Home and its page; then delete it', async ({
    page,
    context,
    baseURL,
  }) => {
    const problems = await collectProblems(page);
    // Letters only, like the address the form makes from the name.
    const tag = Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
    const name = `Test subject ${tag}`;
    const id = `testsubject${tag}`;
    try {
      await page.goto('/admin/subjects');
      await expect(page.getByRole('heading', { level: 1, name: 'Subjects' })).toBeVisible();
      const form = page.getByRole('form', { name: 'Add a subject' });
      await form.getByRole('textbox', { name: 'Name' }).fill(name);
      await expect(form.getByRole('textbox', { name: /Address/ })).toHaveValue(id);
      await form.getByRole('textbox', { name: /Symbol/ }).fill('⚗');
      await form.getByRole('combobox', { name: 'Colour' }).selectOption('orange');
      await form.getByRole('textbox', { name: /One line/ }).fill('Atoms, bonds and reactions.');
      await form.getByRole('button', { name: 'Add subject' }).click();
      await expect(page.getByRole('status')).toHaveText(
        `Added “${name}” at the end, hidden. Show it once it has lessons.`,
      );
      await expectAccessible(page);

      const student = await (await context.browser()!.newContext({ baseURL })).newPage();
      const studentProblems = await collectProblems(student);
      expect((await student.goto(`/study/${id}`))!.status()).toBe(404);
      await student.goto('/');
      await openStudyMenu(student);
      await expect(student.getByRole('link', { name: new RegExp(name) })).toHaveCount(0);

      await page.getByRole('button', { name: `Edit ${name}` }).click();
      const edit = page.getByRole('form', { name: `Edit ${name}` });
      await edit.getByRole('checkbox', { name: 'Show it on the site' }).check();
      await edit.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByRole('status')).toHaveText(`Saved “${name}”.`);

      await student.goto('/');
      await expect(student.getByRole('link', { name: new RegExp(`^${name} Atoms, bonds.* 0 lessons$`) })).toBeVisible();
      await openStudyMenu(student);
      await student
        .getByRole('link', { name: new RegExp(`${name} Atoms, bonds and reactions\\.`) })
        .first()
        .click();
      await expect(student.getByRole('heading', { level: 1, name })).toBeVisible();
      await expect(student.getByText(`Lessons for ${name} are coming soon.`)).toBeVisible();
      await expectAccessible(student);

      // The admin's other pages offer it too.
      await page.goto(`/admin/sections?subject=${id}`);
      await expect(page.getByRole('button', { name, pressed: true })).toBeVisible();
      await expect(page.getByText(`${name} has no sections yet.`)).toBeVisible();

      await page.goto('/admin/subjects');
      await page.getByRole('button', { name: `Delete ${name}` }).click();
      await page.getByRole('button', { name: 'Delete subject' }).click();
      await expect(page.getByRole('status')).toHaveText(`Deleted “${name}”.`);
      expect((await student.goto(`/study/${id}`))!.status()).toBe(404);
      await student.context().close();
      expect(problems).toEqual([]);
      expect(studentProblems.filter((p) => !p.includes('404'))).toEqual([]);
    } finally {
      // Even if a step fails: a leftover subject would change the menus and the sitemap for later tests.
      await serviceClient().from('subjects').delete().eq('id', id);
    }
  });

  test('syllabus: build one by pasting points, tag a lesson → the lesson and the syllabus page show it; then delete it', async ({
    page,
    context,
    baseURL,
  }) => {
    const problems = await collectProblems(page);
    const code = `E2E${Date.now() % 100000}`;
    const title = `E2E syllabus ${code}`;
    try {
      await page.goto('/admin/syllabus');
      await expect(page.getByRole('heading', { level: 1, name: 'Syllabus' })).toBeVisible();
      const form = page.getByRole('form', { name: 'Add a syllabus' });
      await form.getByRole('textbox', { name: /Code/ }).fill(code);
      await form.getByRole('textbox', { name: /Title/ }).fill(title);
      await form.getByRole('button', { name: 'Add syllabus' }).click();
      const status = page.locator('.adm-main > .adm-live');
      await expect(status).toHaveText(`Added “${title}”. Now add its points.`);

      const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: new RegExp(title) }) });
      await card.locator('summary', { hasText: 'Points' }).click();
      const points = card.getByRole('form', { name: `Points of ${title}` });
      await points.getByRole('textbox', { name: /Or paste a list/ }).fill('1.1 Inequalities\n1.2 Kinematics');
      await points.getByRole('button', { name: 'Add the pasted points' }).click();
      await points.getByRole('button', { name: 'Save points' }).click();
      await expect(status).toHaveText(`Saved the 2 points of “${title}”.`);
      await expectAccessible(page);

      // Tag a live lesson from its editor.
      const lessons = (await (await page.request.get('/api/admin/posts?q=AM')).json()).posts as {
        id: string;
        slug: string;
      }[];
      const amgm = lessons.find((l) => l.slug === 'am-gm-inequality')!;
      await page.goto(`/admin/posts/${amgm.id}`);
      const picker = page.getByRole('group', { name: 'Syllabus points' });
      await picker.locator('summary', { hasText: title }).click();
      await picker.getByRole('checkbox', { name: '1.1 Inequalities' }).check();
      await expect(picker.getByText(`Tagged with ${code} 1.1.`)).toBeVisible();

      const student = await (await context.browser()!.newContext({ baseURL })).newPage();
      await student.goto('/posts/am-gm-inequality');
      await student.getByRole('link', { name: `${code} 1.1 Inequalities` }).click();
      await expect(student.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expect(student).toHaveURL(/#p-1-1$/);
      const point = student.locator('#p-1-1');
      await expect(point.getByRole('link', { name: /The AM–GM inequality/ })).toBeVisible();
      await expect(student.locator('#p-1-2')).toContainText('No lesson yet');
      await expect(student.getByText('1 of 2 points with lessons')).toBeVisible();
      await expectAccessible(student);
      await student.context().close();
      expect(problems).toEqual([]);
    } finally {
      // Even if a step fails: a leftover syllabus would change the sitemap for later tests.
      await serviceClient().from('syllabuses').delete().eq('code', code);
    }
  });
});
