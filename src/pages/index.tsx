import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { Layout } from '@/components/layout';
import { REVALIDATE } from '@/lib/isr';
import { formatDate } from '@/lib/format';
import { SUBJECT_IDS, SUBJECTS, type SubjectId } from '@/lib/subjects';
import { getFeaturedProblem, getLatestLessons, getLessonCounts, getProjects } from '@/server/data/public';
import type { FeaturedProblem, PostCard, Project } from '@/server/data/types';
import { Decipher } from '@/ui';
import { PostTile, ProjectCard, SubjectTrack } from '@/views/cards';

type Props = {
  counts: Record<SubjectId, number>;
  latest: PostCard[];
  problem: FeaturedProblem | null;
  projects: Project[];
};

export const getStaticProps: GetStaticProps<Props> = async () => {
  const [counts, latest, problem, projects] = await Promise.all([
    getLessonCounts(),
    getLatestLessons(6),
    getFeaturedProblem(),
    getProjects(),
  ]);
  return { props: { counts, latest, problem, projects: projects.slice(0, 2) }, revalidate: REVALIDATE };
};

function ProblemOfTheWeek({ problem }: { problem: FeaturedProblem }) {
  const s = SUBJECTS[problem.subject];
  return (
    <section className={`section c-${s.color}`} aria-labelledby="potw">
      {problem.hasMath && (
        <Head>
          <link rel="stylesheet" href="/katex/katex.min.css" />
        </Head>
      )}
      <div className="shead">
        <div>
          <span className="eyebrow">Week of {formatDate(problem.weekOf)}</span>
          <h2 id="potw">Problem of the week</h2>
        </div>
        <span className="tag">
          {s.name}
          {problem.sectionTitle ? ` · ${problem.sectionTitle}` : ''}
        </span>
      </div>
      <div className="frame potw">
        <div className="q prose" dangerouslySetInnerHTML={{ __html: problem.statementHtml }} />
        <div className="side">
          {/* <details> works without JavaScript and keeps the answer hidden until asked for. */}
          {problem.hintHtml && (
            <details className="reveal">
              <summary>Show a hint</summary>
              <div className="prose" dangerouslySetInnerHTML={{ __html: problem.hintHtml }} />
            </details>
          )}
          {problem.solutionHtml && (
            <details className="reveal">
              <summary>Show the solution</summary>
              <div className="prose" dangerouslySetInnerHTML={{ __html: problem.solutionHtml }} />
            </details>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Home({ counts, latest, problem, projects }: Props) {
  return (
    <Layout
      title="CodingSpace · Competition maths, physics, coding and IT"
      description="Lessons in competition maths, physics, coding and Cambridge IT, written up so students can review them anytime."
      active="home"
    >
      <section className="hero">
        <span className="eyebrow">Link established · student terminal</span>
        <h1 className="headline" aria-label="Prove it. Model it. Code it.">
          <Decipher className="w1">Prove it.</Decipher>
          <Decipher className="w2">Model it.</Decipher>
          <Decipher className="w3">Code it.</Decipher>
        </h1>
        {/* Body copy is never wrapped in an animator: readable on first paint. */}
        <p className="intro" data-testid="intro">
          Competition maths, physics, programming and Cambridge IT. Lessons I teach in class, written up so you can
          review them anytime. Plus the tools I build for my students.
        </p>
        <div className="cta">
          <Link className="btn pri" href="/study/math">
            Start studying →
          </Link>
          <Link className="btn" href="/author">
            Meet the author →
          </Link>
        </div>
      </section>

      <section className="section" aria-labelledby="study">
        <div className="shead">
          <div>
            <span className="eyebrow">Choose a track</span>
            <h2 id="study">Study</h2>
          </div>
          <span className="more">4 subjects</span>
        </div>
        <div className="tracks">
          {SUBJECT_IDS.map((id) => (
            <SubjectTrack key={id} subject={id} lessons={counts[id]} />
          ))}
        </div>
      </section>

      {problem && <ProblemOfTheWeek problem={problem} />}

      {latest.length > 0 && (
        <section className="section" aria-labelledby="latest">
          <div className="shead">
            <div>
              <span className="eyebrow">Fresh from class</span>
              <h2 id="latest">Latest lessons</h2>
            </div>
          </div>
          <div className="grid3">
            {latest.map((p) => (
              <PostTile key={p.slug} post={p} />
            ))}
          </div>
        </section>
      )}

      {projects.length > 0 && (
        <section className="section" aria-labelledby="projects">
          <div className="shead">
            <div>
              <span className="eyebrow">Built for students</span>
              <h2 id="projects">Projects</h2>
            </div>
            <Link className="more" href="/projects">
              All projects →
            </Link>
          </div>
          <div className="grid2">
            {projects.map((p) => (
              <ProjectCard key={p.slug} project={p} />
            ))}
          </div>
        </section>
      )}
    </Layout>
  );
}
