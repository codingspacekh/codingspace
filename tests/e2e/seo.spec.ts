import { test, expect } from '@playwright/test';

test('pages have a canonical URL, one description and OpenGraph tags', async ({ page }) => {
  await page.goto('/study/math');
  const head = page.locator('head');
  await expect(head.locator('meta[name="description"]')).toHaveCount(1);
  await expect(head.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/study\/math$/);
  await expect(head.locator('meta[name="description"]')).toHaveAttribute('content', /Olympiad-style/);
  await expect(head.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Math · CodingSpaceKH');
  await expect(head.locator('meta[property="og:type"]')).toHaveAttribute('content', 'website');
});

test('lessons carry Article structured data', async ({ page }) => {
  await page.goto('/posts/am-gm-inequality');
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
  const json = await page.locator('script[type="application/ld+json"]').textContent();
  expect(JSON.parse(json!)).toMatchObject({
    '@type': 'Article',
    headline: 'The AM–GM inequality',
    author: { '@type': 'Person', name: 'CodingSpace' },
  });
});

test('sitemap.xml lists the pages and every published post', async ({ request }) => {
  const res = await request.get('/sitemap.xml');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/xml');
  const xml = await res.text();
  for (const path of ['/study/math', '/projects', '/author', '/posts/am-gm-inequality', '/posts/study-tips-km']) {
    expect(xml).toContain(`${path}</loc>`);
  }
  expect(xml.match(/<url>/g)).toHaveLength(7 + 11); // home, 4 subjects, projects, author + posts
});

test('rss.xml is a feed of the newest posts', async ({ request }) => {
  const res = await request.get('/rss.xml');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/rss+xml');
  const xml = await res.text();
  expect(xml).toContain('<rss version="2.0"');
  expect(xml).toContain('<title>The AM–GM inequality</title>');
});

test('robots.txt blocks crawlers until launch, matching the noindex header', async ({ request }) => {
  const res = await request.get('/robots.txt');
  expect(res.headers()['content-type']).toContain('text/plain');
  expect(await res.text()).toBe('User-agent: *\nDisallow: /\n');
});

test('error pages are not given a canonical URL', async ({ page }) => {
  await page.goto('/no-such-page');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});
