import { AdminShell } from '@/views/admin/admin-shell';
import { Dashboard, useDashboardRequest } from '@/views/admin/dashboard';

export default function AdminHome() {
  const request = useDashboardRequest();
  return <AdminShell title="Dashboard">{() => <Dashboard request={request} />}</AdminShell>;
}
