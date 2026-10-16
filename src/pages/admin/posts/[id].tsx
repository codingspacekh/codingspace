import Link from 'next/link';
import { AdminShell } from '@/views/admin/admin-shell';

// The editor (03 ADM-04/05) replaces this page in the next M3 step.
export default function EditPost() {
  return (
    <AdminShell title="Edit post">
      {() => (
        <>
          <h1>Edit post</h1>
          <p>The editor arrives in the next step of M3. The draft is saved and listed under Posts.</p>
          <Link href="/admin/posts">← All posts</Link>
        </>
      )}
    </AdminShell>
  );
}
