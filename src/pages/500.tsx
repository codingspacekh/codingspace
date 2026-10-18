import Link from 'next/link';
import { Layout } from '@/components/layout';
import { Frame } from '@/ui';

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
