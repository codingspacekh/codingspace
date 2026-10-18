import { AdminShell } from '@/views/admin/admin-shell';
import { SyllabusAdmin } from '@/views/admin/syllabus-admin';

export default function AdminSyllabusPage() {
  return <AdminShell title="Syllabus">{() => <SyllabusAdmin />}</AdminShell>;
}
