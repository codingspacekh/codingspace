import { absoluteUrl, articleJsonLd, buildRobots, buildRss, buildSitemap, siteUrl } from '@/lib/seo';

const BASE = 'https://codingspace.io';

describe('siteUrl', () => {
  it('prefers NEXT_PUBLIC_SITE_URL, then the Vercel production domain, then localhost', () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: 'https://codingspace.io/' })).toBe('https://codingspace.io');
    expect(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'codingspace-tawny.vercel.app' })).toBe(
      'https://codingspace-tawny.vercel.app',
    );
    expect(siteUrl({})).toBe('http://localhost:3000');
  });

  it('joins paths onto the base', () => {
    expect(absoluteUrl('/posts/a', BASE)).toBe('https://codingspace.io/posts/a');
    expect(absoluteUrl('/', BASE)).toBe('https://codingspace.io/');
  });
});

describe('buildSitemap', () => {
  it('lists pages with absolute URLs and last-modified dates, escaped', () => {
    const xml = buildSitemap(
      [
        { path: '/', lastmod: null },
        { path: '/posts/a&b', lastmod: '2026-10-16T08:00:00Z' },
      ],
      BASE,
    );
    expect(xml).toMatch(
      /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/,
    );
    expect(xml).toContain('<url><loc>https://codingspace.io/</loc></url>');
    expect(xml).toContain('<url><loc>https://codingspace.io/posts/a&amp;b</loc><lastmod>2026-10-16</lastmod></url>');
    expect(xml.trim().endsWith('</urlset>')).toBe(true);
  });
});

describe('buildRss', () => {
  const xml = buildRss(
    [
      {
        title: 'AM–GM <inequality>',
        path: '/posts/am-gm-inequality',
        summary: 'Means & order',
        publishedAt: '2026-10-16T08:00:00Z',
      },
    ],
    BASE,
  );

  it('is an RSS 2.0 channel with a self link', () => {
    expect(xml).toContain('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">');
    expect(xml).toContain('<atom:link href="https://codingspace.io/rss.xml" rel="self" type="application/rss+xml"/>');
    expect(xml).toContain('<link>https://codingspace.io/</link>');
  });

  it('escapes item text and uses RFC 822 dates', () => {
    expect(xml).toContain('<title>AM–GM &lt;inequality&gt;</title>');
    expect(xml).toContain('<description>Means &amp; order</description>');
    expect(xml).toContain('<guid isPermaLink="true">https://codingspace.io/posts/am-gm-inequality</guid>');
    expect(xml).toContain('<pubDate>Fri, 16 Oct 2026 08:00:00 GMT</pubDate>');
  });
});

describe('buildRobots', () => {
  it('blocks every crawler until launch', () => {
    expect(buildRobots(false, BASE)).toBe('User-agent: *\nDisallow: /\n');
  });

  it('allows crawling and points to the sitemap once indexable', () => {
    expect(buildRobots(true, BASE)).toBe('User-agent: *\nAllow: /\n\nSitemap: https://codingspace.io/sitemap.xml\n');
  });
});

describe('articleJsonLd', () => {
  const json = articleJsonLd(
    {
      slug: 'am-gm',
      title: 'AM–GM </script><script>alert(1)</script>',
      summary: 'Means',
      lang: 'en',
      publishedAt: '2026-10-16T08:00:00Z',
      updatedAt: '2026-10-20T08:00:00Z',
    },
    { author: 'CodingSpace', base: BASE },
  );

  it('describes the post as a schema.org Article', () => {
    expect(JSON.parse(json)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'AM–GM </script><script>alert(1)</script>',
      description: 'Means',
      inLanguage: 'en',
      datePublished: '2026-10-16T08:00:00Z',
      dateModified: '2026-10-20T08:00:00Z',
      mainEntityOfPage: 'https://codingspace.io/posts/am-gm',
      author: { '@type': 'Person', name: 'CodingSpace' },
      publisher: { '@type': 'Organization', name: 'CodingSpace' },
    });
  });

  it('cannot close the script element it is placed in', () => {
    expect(json).not.toContain('</script');
    expect(json).not.toContain('<');
  });
});
