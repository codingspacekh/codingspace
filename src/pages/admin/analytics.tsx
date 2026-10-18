import { AdminShell } from '@/views/admin/admin-shell';
import { AnalyticsDashboard } from '@/views/admin/analytics';

export default function AdminAnalytics() {
  return <AdminShell title="Analytics">{() => <AnalyticsDashboard />}</AdminShell>;
}
