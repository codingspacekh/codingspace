/** SEO builders (04 M2): canonical URLs, sitemap.xml, rss.xml, robots.txt and Article JSON-LD. */

export const SITE_NAME = 'CodingSpaceKH';
export const SITE_DESCRIPTION =
  'Lessons in competition maths, physics, coding and Cambridge IT, written up so students can review them anytime.';

type Env = Partial<Record<'NEXT_PUBLIC_SITE_URL' | 'VERCEL_PROJECT_PRODUCTION_URL', string>>;

/**
 * The public origin for absolute links. Set NEXT_PUBLIC_SITE_URL once codingspacekh.dev is live;
 * until then Vercel's production domain is used (Vercel sets VERCEL_PROJECT_PRODUCTION_URL).
 */
export function siteUrl(env: Env = process.env as Env): string {
  if (env.NEXT_PUBLIC_SITE_URL) return env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '');
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return 'http://localhost:3000';
}

export const absoluteUrl = (path: string, base = siteUrl()) => `${base}${path.startsWith('/') ? path : `/${path}`}`;

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function buildSitemap(entries: { path: string; lastmod: string | null }[], base = siteUrl()): string {
  const urls = entries.map(
    (e) =>
      `<url><loc>${escapeXml(absoluteUrl(e.path, base))}</loc>` +
      (e.lastmod ? `<lastmod>${e.lastmod.slice(0, 10)}</lastmod>` : '') +
      `</url>`,
  );
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
  );
}

export type FeedItem = { title: string; path: string; summary: string; publishedAt: string };

export function buildRss(items: FeedItem[], base = siteUrl()): string {
  const entries = items.map((i) => {
    const link = escapeXml(absoluteUrl(i.path, base));
    return (
      `<item><title>${escapeXml(i.title)}</title><link>${link}</link>` +
      `<guid isPermaLink="true">${link}</guid>` +
      `<pubDate>${new Date(i.publishedAt).toUTCString()}</pubDate>` +
      `<description>${escapeXml(i.summary)}</description></item>`
    );
  });
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>` +
    `<title>${SITE_NAME}</title><link>${escapeXml(absoluteUrl('/', base))}</link>` +
    `<description>${escapeXml(SITE_DESCRIPTION)}</description><language>en</language>` +
    `<atom:link href="${escapeXml(absoluteUrl('/rss.xml', base))}" rel="self" type="application/rss+xml"/>\n` +
    `${entries.join('\n')}\n</channel></rss>\n`
  );
}

/** Mirrors the X-Robots-Tag header: everything blocked until launch (M7 sets SITE_INDEXABLE=true). */
export function buildRobots(indexable: boolean, base = siteUrl()): string {
  if (!indexable) return 'User-agent: *\nDisallow: /\n';
  return `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${absoluteUrl('/sitemap.xml', base)}\n`;
}

/**
 * schema.org Article for a post. The result goes inside <script type="application/ld+json">,
 * so every "<" is escaped: a title containing "</script>" cannot end the element early.
 */
export function articleJsonLd(
  post: { slug: string; title: string; summary: string; lang: string; publishedAt: string; updatedAt: string },
  { author, base = siteUrl() }: { author: string; base?: string },
): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.summary,
    inLanguage: post.lang,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    mainEntityOfPage: absoluteUrl(`/posts/${post.slug}`, base),
    author: { '@type': 'Person', name: author },
    publisher: { '@type': 'Organization', name: SITE_NAME },
  }).replace(/</g, '\\u003c');
}
