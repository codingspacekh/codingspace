import type { GetStaticProps } from 'next';
import Link from 'next/link';
import { Layout } from '@/components/layout';
import type { Subject } from '@/lib/subjects';
import { getSubjects } from '@/server/data/public';
import { Frame } from '@/ui';

// The menus list the subjects as they were at build time.
export const getStaticProps: GetStaticProps<{ subjects: Subject[] }> = async () => ({
  props: { subjects: await getSubjects() },
});

export default function ServerError() {
  return (
    <Layout title="Something went wrong · CodingSpaceKH">
      <Frame>
        <span className="eyebrow">Error 500</span>
        <h1>System fault</h1>
        <p>Something went wrong on our side. Please try again in a minute.</p>
        <Link className="btn" href="/">
          ← Back to home
        </Link>
      </Frame>
    </Layout>
  );
}
