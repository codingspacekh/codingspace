import { AdminShell } from '@/views/admin/admin-shell';
import { MediaLibrary } from '@/views/admin/media-library';

export default function AdminMedia() {
  return <AdminShell title="Media">{() => <MediaLibrary />}</AdminShell>;
}
