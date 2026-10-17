import { AdminShell } from '@/views/admin/admin-shell';
import { ActivityLog } from '@/views/admin/activity-log';

export default function AdminActivity() {
  return <AdminShell title="Activity">{() => <ActivityLog />}</AdminShell>;
}
