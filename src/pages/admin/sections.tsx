import { useRouter } from 'next/router';
import { isSubjectId, type SubjectId } from '@/lib/subjects';
import { AdminShell } from '@/views/admin/admin-shell';
import { StudyStructure } from '@/views/admin/study-structure';

export default function AdminSections() {
  const router = useRouter();
  // The subject is in the address bar (?subject=physics), so a reload keeps it.
  const subject: SubjectId = isSubjectId(router.query.subject) ? router.query.subject : 'math';
  return (
    <AdminShell title="Study structure">
      {() => (
        <>
          <h1>Study structure</h1>
          {router.isReady && (
            <StudyStructure
              key={subject}
              subject={subject}
              onSubject={(s) =>
                router.replace({ pathname: '/admin/sections', query: { subject: s } }, undefined, { shallow: true })
              }
            />
          )}
        </>
      )}
    </AdminShell>
  );
}
