import type { GetServerSideProps } from 'next';
import { buildSitemap } from '@/lib/seo';
import { getSeriesSlugs, getSitemapPosts, getSubjects } from '@/server/data/public';

// Served as XML from the server; the CDN keeps it for 10 minutes.
export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const [posts, series, subjects] = await Promise.all([getSitemapPosts(), getSeriesSlugs(), getSubjects()]);
  const xml = buildSitemap([
    { path: '/', lastmod: null },
    ...subjects.map((s) => ({ path: `/study/${s.id}`, lastmod: null })),
    { path: '/series', lastmod: null },
    ...series.map((slug) => ({ path: `/series/${slug}`, lastmod: null })),
    { path: '/projects', lastmod: null },
    { path: '/author', lastmod: null },
    ...posts.map((p) => ({ path: `/posts/${p.slug}`, lastmod: p.updatedAt })),
  ]);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
  res.end(xml);
  return { props: {} };
};

export default function Sitemap() {
  return null;
}
