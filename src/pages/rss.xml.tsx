import type { GetServerSideProps } from 'next';
import { buildRss } from '@/lib/seo';
import { getFeedPosts } from '@/server/data/public';

// The 20 newest posts (lessons and life posts), for feed readers.
export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const posts = await getFeedPosts(20);
  const xml = buildRss(
    posts.map((p) => ({ title: p.title, path: `/posts/${p.slug}`, summary: p.summary, publishedAt: p.publishedAt })),
  );
  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
  res.end(xml);
  return { props: {} };
};

export default function Rss() {
  return null;
}
