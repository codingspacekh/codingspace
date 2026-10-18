import type { GetStaticProps } from 'next';
import Link from 'next/link';
import { Layout } from '@/components/layout';
import { REVALIDATE } from '@/lib/isr';
import type { Subject } from '@/lib/subjects';
import { getSubjects } from '@/server/data/public';
import { Frame } from '@/ui';

// The menus list the subjects (refreshed like other pages).
export const getStaticProps: GetStaticProps<{ subjects: Subject[] }> = async () => ({
  props: { subjects: await getSubjects() },
  revalidate: REVALIDATE,
});

export default function NotFound() {
  return (
    <Layout title="Page not found · CodingSpaceKH">
      <Frame>
        <span className="eyebrow">Error 404</span>
        <h1>Signal lost</h1>
        <p>We couldn’t find that page. It may have moved, or the link may be mistyped.</p>
        <Link className="btn" href="/">
          ← Back to home
        </Link>
      </Frame>
    </Layout>
  );
}
