import type { GetServerSideProps } from 'next';
import { buildSitemap } from '@/lib/seo';
import { SUBJECT_IDS } from '@/lib/subjects';
import { getSitemapPosts } from '@/server/data/public';

// Served as XML from the server; the CDN keeps it for 10 minutes.
export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const posts = await getSitemapPosts();
  const xml = buildSitemap([
    { path: '/', lastmod: null },
    ...SUBJECT_IDS.map((s) => ({ path: `/study/${s}`, lastmod: null })),
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
