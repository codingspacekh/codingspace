import { AdminShell } from '@/views/admin/admin-shell';
import { QuestionsAdmin } from '@/views/admin/questions-admin';

export default function AdminQuestionsPage() {
  return <AdminShell title="Questions & comments">{() => <QuestionsAdmin />}</AdminShell>;
}
