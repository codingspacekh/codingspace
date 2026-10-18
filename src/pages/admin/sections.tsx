import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSubjects } from '@/lib/subjects';
import { AdminShell } from '@/views/admin/admin-shell';
import { StudyStructure } from '@/views/admin/study-structure';

export default function AdminSections() {
  const router = useRouter();
  return <AdminShell title="Study structure">{() => router.isReady && <Structure />}</AdminShell>;
}

/** Inside the shell, which shares the subjects. */
function Structure() {
  const router = useRouter();
  const { subjects } = useSubjects();
  // The subject is in the address bar (?subject=physics), so a reload keeps it.
  const subject = subjects.find((s) => s.id === router.query.subject)?.id ?? subjects[0]?.id;
  if (!subject) {
    return (
      <p className="empty">
        There are no subjects yet. Add one in <Link href="/admin/subjects">Subjects</Link>.
      </p>
    );
  }
  return (
    <StudyStructure
      key={subject}
      subject={subject}
      onSubject={(s) =>
        router.replace({ pathname: '/admin/sections', query: { subject: s } }, undefined, { shallow: true })
      }
    />
  );
}
