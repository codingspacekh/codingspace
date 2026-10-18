import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Layout } from '@/components/layout';
import { api, safeNext } from '@/lib/admin-api';
import type { PostPageData } from '@/server/data/types';
import { toSignIn } from '@/views/admin/admin-shell';
import { PostView } from '@/views/post-view';

/** 03 ADM-08: the draft exactly as students would see it, behind sign-in (and never indexed). */
export default function PreviewPage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : null;
  const [data, setData] = useState<PostPageData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    api<PostPageData & { error?: string }>(`/api/admin/posts/${id}/preview`).then(({ status, data: d }) => {
      if (status === 200) setData(d);
      else if (status === 401) void toSignIn(router, d.error === 'expired' ? 'expired' : undefined);
      else setError(status === 404 ? 'This post does not exist.' : 'The preview could not be loaded.');
    });
  }, [id, router]);

  const banner = (
    <p className="adm-preview-bar" role="note">
      Preview of the draft: students can’t see this page.{' '}
      {id && <Link href={safeNext(`/admin/posts/${id}`)}>Back to the editor</Link>}
    </p>
  );

  if (!data)
    return (
      <Layout title="Preview · CodingSpaceKH admin">
        {banner}
        {error ? (
          <p role="alert" className="adm-error">
            {error}
          </p>
        ) : (
          <p aria-live="polite">Loading the preview…</p>
        )}
      </Layout>
    );

  return (
    <Layout
      title={`Preview: ${data.post.title} · CodingSpaceKH admin`}
      active={data.post.kind === 'life' ? 'author' : 'study'}
    >
      {banner}
      <PostView {...data} />
    </Layout>
  );
}
