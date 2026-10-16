import { AdminShell } from '@/views/admin/admin-shell';

export default function AdminHome() {
  return (
    <AdminShell title="Dashboard">
      {() => (
        <>
          <h1>Dashboard</h1>
          <p>You’re signed in with two-step verification. Posts and the editor arrive in the next M3 steps.</p>
        </>
      )}
    </AdminShell>
  );
}
