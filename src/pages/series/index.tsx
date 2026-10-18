import type { GetStaticProps } from 'next';
import Link from 'next/link';
import { Layout } from '@/components/layout';
import { REVALIDATE } from '@/lib/isr';
import { useSubjects, type Subject } from '@/lib/subjects';
import { getSeriesList, getSubjects } from '@/server/data/public';
import type { SeriesSummary } from '@/server/data/types';

type Props = { series: SeriesSummary[]; subjects: Subject[] };

export const getStaticProps: GetStaticProps<Props> = async () => {
  const [series, subjects] = await Promise.all([getSeriesList(), getSubjects()]);
  return { props: { series, subjects }, revalidate: REVALIDATE };
};

/** v1.1: every lesson series, in the owner's order. A series can mix subjects. */
export default function SeriesIndex({ series }: Props) {
  const { subject } = useSubjects();
  return (
    <Layout
      title="Series · CodingSpaceKH"
      description="Lessons from across subjects, in the order to take them."
      path="/series"
      active="study"
    >
      <div className="c-pink">
        <header className="phead">
          <div className="phead-copy">
            <span className="crumbs">Study / Series</span>
            <h1>Series</h1>
            <p className="lead">
              Lessons from across subjects, in the order to take them: a course, an exam paper or the maths a physics
              topic needs.
            </p>
          </div>
          <div className="big" aria-hidden="true">
            ⇢
          </div>
        </header>
        {series.length === 0 ? (
          <p className="empty">
            Series are coming soon. <Link href="/">Back to home</Link>
          </p>
        ) : (
          <ul className="series-list">
            {series.map((s) => (
              <li key={s.slug}>
                <Link href={`/series/${s.slug}`} className="frame series-card">
                  <h2>{s.title}</h2>
                  {s.description && <p>{s.description}</p>}
                  <span className="stack">
                    {s.subjectIds.map((id) => (
                      <span key={id} className={`tag c-${subject(id)?.color ?? 'pink'}`}>
                        {subject(id)?.name ?? id}
                      </span>
                    ))}
                    <span className="meta">
                      {s.lessonCount} lesson{s.lessonCount === 1 ? '' : 's'}
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
