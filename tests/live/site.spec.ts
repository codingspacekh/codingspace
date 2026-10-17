import { expect, test } from '@playwright/test';

// The live site (M7): HTTPS everywhere, the security headers on the real domain, links and
// media that resolve, and search engines kept out until launch (EXPECT_INDEXABLE=true after).

const indexable = process.env.EXPECT_INDEXABLE === 'true';
const live = () => new URL(test.info().project.use.baseURL!);

test('plain http and www redirect permanently to https on the bare domain', async ({ request }) => {
  const { host } = live();
  for (const from of [`http://${host}/`, `https://www.${host}/`, `http://www.${host}/`]) {
    // Follow by hand: every hop permanent, and http first goes to https on the same host
    // (what HSTS preloading asks), so http://www → https://www → https://<domain>.
    let url = from;
    for (let hop = 0; url !== `https://${host}/`; hop++) {
      expect(hop, `${from} redirects too often`).toBeLessThan(3);
      const res = await request.get(url, { maxRedirects: 0 });
      expect([301, 308], url).toContain(res.status());
      const next = new URL(res.headers().location!, url).href;
      if (url.startsWith('http:')) expect(next, url).toBe(url.replace(/^http:/, 'https:'));
      url = next;
    }
  }
});

for (const path of ['/', '/study/math', '/this-page-does-not-exist']) {
  test(`${path} sends the security headers`, async ({ request }) => {
    const res = await request.get(path);
    const h = res.headers();
    const csp = h['content-security-policy'] ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src')) ?? '';
    expect(scriptSrc).not.toContain("'unsafe-");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toMatch(new RegExp(`img-src 'self' data: https://files\\.${live().host.replace(/\./g, '\\.')}`));
    expect(h['strict-transport-security']).toBe('max-age=63072000; includeSubDomains; preload');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['permissions-policy']).toContain('camera=()');
    expect(h['cross-origin-opener-policy']).toBe('same-origin');
    expect(h['x-powered-by']).toBeUndefined();
    if (indexable) expect(h['x-robots-tag']).toBeUndefined();
    else expect(h['x-robots-tag']).toBe('noindex, nofollow');
  });
}

test('robots.txt and the sitemap match the launch state and the real domain', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  if (indexable) expect(robots).toContain(`Sitemap: ${live().origin}/sitemap.xml`);
  else expect(robots).toContain('Disallow: /\n');
  const sitemap = await (await request.get('/sitemap.xml')).text();
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  expect(urls.length).toBeGreaterThan(0);
  for (const u of urls) expect(u.startsWith(`${live().origin}/`), u).toBe(true);
});

test('every page in the sitemap loads, and every image and file on it resolves', async ({ request }) => {
  test.setTimeout(120_000);
  const sitemap = await (await request.get('/sitemap.xml')).text();
  const pages = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  const media = new Set<string>();
  for (const page of pages) {
    const res = await request.get(page);
    expect(res.status(), page).toBe(200);
    const html = await res.text();
    expect(html, `${page} links to an old address`).not.toMatch(/pub-[a-z0-9]+\.r2\.dev|\.vercel\.app/);
    expect(html).toContain(`<link rel="canonical" href="${page}"`);
    for (const m of html.matchAll(/https:\/\/files\.[a-z0-9.-]+\/[^"\s,]+/g)) media.add(m[0]);
  }
  for (const url of media) {
    const res = await request.head(url);
    expect(res.status(), url).toBe(200);
  }
});

test('the admin and its API are not open', async ({ request }) => {
  expect((await request.get('/api/admin/dashboard')).status()).toBe(401);
  expect((await request.get('/api/admin/export')).status()).toBe(401);
  expect((await request.get('/api/cron/publish-due')).status()).toBe(401);
  const login = await request.get('/admin/login');
  expect(login.status()).toBe(200);
  expect(login.headers()['x-robots-tag']).toContain('noindex');
});

test('a malformed lesson address is a clean 404, not a 500', async ({ request }) => {
  // An injection-shaped slug must be rejected before any database query (it would otherwise reach
  // the WAF in front of the DB and surface as a 500). The body leaks nothing either way.
  for (const slug of ["x' OR 1=1--", "' UNION SELECT NULL--", 'a/../b']) {
    const res = await request.get(`/posts/${encodeURIComponent(slug)}`);
    expect(res.status(), slug).toBe(404);
    expect(await res.text(), slug).not.toMatch(/syntax error|PGRST|SQLSTATE|relation "|supabase\.co/);
  }
});
