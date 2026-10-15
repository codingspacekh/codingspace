import Link from 'next/link';
import { Layout } from '@/components/layout';
import { Frame } from '@/ui';

export default function NotFound() {
  return (
    <Layout title="Page not found · CodingSpace">
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
