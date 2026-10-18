import { AdminShell } from '@/views/admin/admin-shell';
import { SubjectsAdmin } from '@/views/admin/subjects-admin';

export default function AdminSubjectsPage() {
  return <AdminShell title="Subjects">{() => <SubjectsAdmin />}</AdminShell>;
}
