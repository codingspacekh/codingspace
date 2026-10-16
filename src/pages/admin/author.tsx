import { AdminShell } from '@/views/admin/admin-shell';
import { AuthorAdmin } from '@/views/admin/author-admin';

export default function AdminAuthor() {
  return <AdminShell title="Author page">{() => <AuthorAdmin />}</AdminShell>;
}
