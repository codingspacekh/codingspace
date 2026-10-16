import { AdminShell } from '@/views/admin/admin-shell';
import { Dashboard } from '@/views/admin/dashboard';

export default function AdminHome() {
  return <AdminShell title="Dashboard">{() => <Dashboard />}</AdminShell>;
}
