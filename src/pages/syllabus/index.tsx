import type { GetStaticProps } from 'next';
import Link from 'next/link';
import { Layout } from '@/components/layout';
import { REVALIDATE } from '@/lib/isr';
import { useSubjects, type Subject } from '@/lib/subjects';
import { getSubjects, getSyllabusList } from '@/server/data/public';
import type { SyllabusSummary } from '@/server/data/types';

type Props = { syllabuses: SyllabusSummary[]; subjects: Subject[] };

export const getStaticProps: GetStaticProps<Props> = async () => {
  const [syllabuses, subjects] = await Promise.all([getSyllabusList(), getSubjects()]);
  return { props: { syllabuses, subjects }, revalidate: REVALIDATE };
};

/** v1.1: every syllabus taught here, in the owner's order, with how much of it has lessons. */
export default function SyllabusIndex({ syllabuses }: Props) {
  const { subject } = useSubjects();
  return (
    <Layout
      title="Syllabus · CodingSpaceKH"
      description="Find the lessons for each point of the syllabus you are studying."
      path="/syllabus"
      active="study"
    >
      <div className="c-sky">
        <header className="phead">
          <div className="phead-copy">
            <span className="crumbs">Study / Syllabus</span>
            <h1>Syllabus</h1>
            <p className="lead">
              Every point of the syllabus you are studying, with the lessons that cover it. Use it to revise for an
              exam, one point at a time.
            </p>
          </div>
          <div className="big" aria-hidden="true">
            §
          </div>
        </header>
        {syllabuses.length === 0 ? (
          <p className="empty">
            Syllabus lists are coming soon. <Link href="/">Back to home</Link>
          </p>
        ) : (
          <ul className="series-list">
            {syllabuses.map((s) => (
              <li key={s.slug}>
                <Link
                  href={`/syllabus/${s.slug}`}
                  className={`frame series-card c-${subject(s.subject)?.color ?? 'sky'}`}
                >
                  <h2>{s.title}</h2>
                  {s.description && <p>{s.description}</p>}
                  <span className="stack">
                    <span className="tag">{s.code}</span>
                    <span className="meta">
                      {s.covered} of {s.points} point{s.points === 1 ? '' : 's'} with lessons
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
}
