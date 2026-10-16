import { AdminShell } from '@/views/admin/admin-shell';
import { ProblemsAdmin } from '@/views/admin/problems-admin';

export default function AdminProblems() {
  return <AdminShell title="Problem of the week">{() => <ProblemsAdmin />}</AdminShell>;
}
