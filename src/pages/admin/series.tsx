import { AdminShell } from '@/views/admin/admin-shell';
import { SeriesAdmin } from '@/views/admin/series-admin';

export default function AdminSeriesPage() {
  return <AdminShell title="Series">{() => <SeriesAdmin />}</AdminShell>;
}
