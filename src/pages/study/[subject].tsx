import type { GetStaticPaths, GetStaticProps } from 'next';
import Link from 'next/link';
import { Layout } from '@/components/layout';
import { REVALIDATE } from '@/lib/isr';
import { SUBJECT_ID, type Subject } from '@/lib/subjects';
import { getFeaturedProblem, getSubjects, getSubjectSections } from '@/server/data/public';
import type { FeaturedProblem, SectionWithLessons } from '@/server/data/types';
import { LessonRow } from '@/views/cards';
import { ProblemOfTheWeek } from '@/views/problem-of-the-week';
import { Progress } from '@/views/progress';

type Props = { subject: Subject; sections: SectionWithLessons[]; problem: FeaturedProblem | null; subjects: Subject[] };

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: (await getSubjects()).map((s) => ({ params: { subject: s.id } })),
  // Subjects added (or shown) after the build are rendered on first request, then cached.
  fallback: 'blocking',
});

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const id = params?.subject;
  if (typeof id !== 'string' || !SUBJECT_ID.test(id)) return { notFound: true, revalidate: REVALIDATE };
  // Hidden subjects aren't in the list (RLS), so their page is a 404 like a missing one.
  const subjects = await getSubjects();
  const subject = subjects.find((s) => s.id === id);
  if (!subject) return { notFound: true, revalidate: REVALIDATE };
  const [sections, problem] = await Promise.all([getSubjectSections(subject.id), getFeaturedProblem(subject.id)]);
  return { props: { subject, sections, problem, subjects }, revalidate: REVALIDATE };
};

export default function StudySubject({ subject: s, sections, problem }: Props) {
  const subject = s.id;
  return (
    <Layout title={`${s.name} · CodingSpaceKH`} description={s.intro} path={`/study/${subject}`} active="study">
      <div className={`c-${s.color}`}>
        <header className="phead">
          <div className="phead-copy">
            <span className="crumbs">Study / {s.name}</span>
            <h1>{s.name}</h1>
            <p className="lead">{s.intro}</p>
            <Progress
              slugs={sections.flatMap((sec) => sec.lessons.map((l) => l.slug))}
              label={`Your progress in ${s.name}`}
            />
          </div>
          <div className="big" aria-hidden="true">
            {s.glyph}
          </div>
        </header>

        {sections.length > 0 && (
          <nav aria-label="Sections" className="chips">
            {sections.map((sec) => (
              <a key={sec.slug} href={`#${sec.slug}`} className="chip">
                {sec.title}
                <small>{sec.lessons.length}</small>
              </a>
            ))}
          </nav>
        )}

        {/* 03 PUB-05: the subject's problem of the week (Math has one; any subject can). */}
        {problem && <ProblemOfTheWeek problem={problem} />}

        {sections.map((sec, i) => (
          <section key={sec.slug} id={sec.slug} className="cat" aria-labelledby={`${sec.slug}-title`}>
            <div className="ci">
              <span className="sn">{String(i + 1).padStart(2, '0')}</span>
              <h2 id={`${sec.slug}-title`}>{sec.title}</h2>
              {sec.description && <p>{sec.description}</p>}
              <Progress slugs={sec.lessons.map((l) => l.slug)} label={`Your progress in ${sec.title}`} />
            </div>
            {sec.lessons.length > 0 ? (
              <div className="lessons">
                {sec.lessons.map((l) => (
                  <LessonRow key={l.slug} lesson={l} />
                ))}
              </div>
            ) : (
              <p className="empty">Lessons for this section are coming soon.</p>
            )}
          </section>
        ))}

        {sections.length === 0 && (
          <p className="empty">
            Lessons for {s.name} are coming soon. <Link href="/">Back to home</Link>
          </p>
        )}
      </div>
    </Layout>
  );
}
