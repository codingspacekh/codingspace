import type { GetServerSideProps } from 'next';
import { buildRobots } from '@/lib/seo';

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600');
  res.end(buildRobots(process.env.SITE_INDEXABLE === 'true'));
  return { props: {} };
};

export default function Robots() {
  return null;
}
