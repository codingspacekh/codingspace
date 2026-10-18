import type { GetStaticPaths, GetStaticProps } from 'next';
import Link from 'next/link';
import { Layout } from '@/components/layout';
import { REVALIDATE } from '@/lib/isr';
import { useSubjects, type Subject } from '@/lib/subjects';
import { pointAnchor } from '@/lib/syllabus';
import { getSubjects, getSyllabusPage, getSyllabusSlugs } from '@/server/data/public';
import type { SyllabusPageData } from '@/server/data/types';
import { LessonRow } from '@/views/cards';

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: (await getSyllabusSlugs()).map((slug) => ({ params: { slug } })),
  // Syllabuses added after the build are rendered on first request, then cached.
  fallback: 'blocking',
});

type Props = SyllabusPageData & { subjects: Subject[] };

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const slug = typeof params?.slug === 'string' ? params.slug : '';
  const [data, subjects] = await Promise.all([slug ? getSyllabusPage(slug) : null, getSubjects()]);
  if (!data) return { notFound: true, revalidate: REVALIDATE };
  return { props: { ...data, subjects }, revalidate: REVALIDATE };
};

/** v1.1: one syllabus, point by point, with the published lessons that cover each one. */
export default function SyllabusPage({ slug, code, title, description, subject, points }: Props) {
  const color = useSubjects().subject(subject)?.color ?? 'sky';
  const covered = points.filter((p) => p.lessons.length).length;
  return (
    <Layout
      title={`${title} · Syllabus · CodingSpaceKH`}
      description={description || `Lessons for each point of ${title}.`}
      path={`/syllabus/${slug}`}
      active="study"
    >
      <div className={`c-${color}`}>
        <header className="phead">
          <div className="phead-copy">
            <nav aria-label="Breadcrumb" className="crumbs">
              <span>Study</span> / <Link href="/syllabus">Syllabus</Link>
            </nav>
            <h1>{title}</h1>
            {description && <p className="lead">{description}</p>}
            <span className="stack">
              <span className="tag">{code}</span>
              <span className="meta">
                {covered} of {points.length} point{points.length === 1 ? '' : 's'} with lessons
              </span>
            </span>
          </div>
          <div className="big" aria-hidden="true">
            §
          </div>
        </header>
        <ol className="syl-points" aria-label={`${title}, point by point`}>
          {points.map((p) => (
            <li key={p.code} id={pointAnchor(p.code)}>
              <h2>
                <span className="syl-code">{p.code}</span> {p.title}
              </h2>
              {p.lessons.length ? (
                <div className="lessons">
                  {p.lessons.map((l) => (
                    <LessonRow key={l.slug} lesson={l} />
                  ))}
                </div>
              ) : (
                <p className="meta">No lesson yet</p>
              )}
            </li>
          ))}
        </ol>
      </div>
    </Layout>
  );
}
