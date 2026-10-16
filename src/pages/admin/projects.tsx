import { AdminShell } from '@/views/admin/admin-shell';
import { ProjectsAdmin } from '@/views/admin/projects-admin';

export default function AdminProjects() {
  return <AdminShell title="Projects">{() => <ProjectsAdmin />}</AdminShell>;
}
