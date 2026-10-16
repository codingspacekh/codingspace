import dynamic from 'next/dynamic';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { AdminShell } from '@/views/admin/admin-shell';

// Tiptap and KaTeX are large and browser-only: they load on this page, never on the public site.
const EditPost = dynamic(() => import('@/views/admin/edit-post').then((m) => m.EditPost), {
  ssr: false,
  loading: () => <p aria-live="polite">Loading the editor…</p>,
});

export default function EditPostPage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : null;
  return (
    <AdminShell title="Edit post">
      {() => (
        <>
          <Head>
            {/* The live maths preview uses the same KaTeX stylesheet as lesson pages. */}
            <link rel="stylesheet" href="/katex/katex.min.css" />
          </Head>
          <h1 className="sr-only">Edit post</h1>
          {id && <EditPost id={id} />}
        </>
      )}
    </AdminShell>
  );
}
