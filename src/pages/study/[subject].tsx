import type { GetStaticPaths, GetStaticProps } from 'next';
import Link from 'next/link';
import { Layout } from '@/components/layout';
import { REVALIDATE } from '@/lib/isr';
import { isSubjectId, SUBJECT_IDS, SUBJECTS, type SubjectId } from '@/lib/subjects';
import { getFeaturedProblem, getSubjectSections } from '@/server/data/public';
import type { FeaturedProblem, SectionWithLessons } from '@/server/data/types';
import { LessonRow } from '@/views/cards';
import { ProblemOfTheWeek } from '@/views/problem-of-the-week';

type Props = { subject: SubjectId; sections: SectionWithLessons[]; problem: FeaturedProblem | null };

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: SUBJECT_IDS.map((subject) => ({ params: { subject } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const subject = params?.subject;
  if (!isSubjectId(subject)) return { notFound: true };
  const [sections, problem] = await Promise.all([getSubjectSections(subject), getFeaturedProblem(subject)]);
  return { props: { subject, sections, problem }, revalidate: REVALIDATE };
};

export default function StudySubject({ subject, sections, problem }: Props) {
  const s = SUBJECTS[subject];
  return (
    <Layout title={`${s.name} · CodingSpace`} description={s.intro} path={`/study/${subject}`} active="study">
      <div className={`c-${s.color}`}>
        <header className="phead">
          <div className="phead-copy">
            <span className="crumbs">Study / {s.name}</span>
            <h1>{s.name}</h1>
            <p className="lead">{s.intro}</p>
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
