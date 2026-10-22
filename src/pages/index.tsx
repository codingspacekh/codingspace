import type { GetStaticProps } from 'next';
import Link from 'next/link';
import { Layout } from '@/components/layout';
import { REVALIDATE } from '@/lib/isr';
import type { Subject, SubjectId } from '@/lib/subjects';
import { getFeaturedProblem, getLatestLessons, getLessonCounts, getProjects, getSubjects } from '@/server/data/public';
import type { FeaturedProblem, PostCard, Project } from '@/server/data/types';
import { Decipher, OrbitHero, Stagger } from '@/ui';
import { LatestLessons, ProjectCard, SubjectTrack } from '@/views/cards';
import { ProblemOfTheWeek } from '@/views/problem-of-the-week';

type Props = {
  counts: Record<SubjectId, number>;
  latest: PostCard[];
  problem: FeaturedProblem | null;
  projects: Project[];
  subjects: Subject[];
};

export const getStaticProps: GetStaticProps<Props> = async () => {
  const [counts, latest, problem, projects, subjects] = await Promise.all([
    getLessonCounts(),
    getLatestLessons(6),
    getFeaturedProblem(),
    getProjects(),
    getSubjects(),
  ]);
  return { props: { counts, latest, problem, projects: projects.slice(0, 2), subjects }, revalidate: REVALIDATE };
};

export default function Home({ counts, latest, problem, projects, subjects }: Props) {
  return (
    <Layout
      title="CodingSpaceKH · Competition maths, physics, coding and IT"
      description="Lessons in competition maths, physics, coding and Cambridge IT, written up so students can review them anytime."
      path="/"
      active="home"
    >
      <section className="hero">
        <div className="hero-copy">
          <h1 className="headline" aria-label="Love math. Crush physics. Live code.">
            <Stagger>
              <Decipher className="w1">Love math.</Decipher>
              <Decipher className="w2">Crush physics.</Decipher>
              <Decipher className="w3">Live code.</Decipher>
            </Stagger>
          </h1>
          {/* Body copy is never wrapped in an animator: readable on first paint. */}
          <p className="intro" data-testid="intro">
            A personal site to share educational content on Math, Physics, Coding and my personal life.
          </p>
          <div className="cta">
            <Link className="btn pri" href="/study/math">
              Start studying
            </Link>
            <Link className="btn" href="/author">
              Meet the author
            </Link>
          </div>
        </div>
        <OrbitHero />
      </section>

      <section className="section" aria-labelledby="study">
        <div className="shead">
          <h2 id="study">Study</h2>
          <span className="more">
            {subjects.length} subject{subjects.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="tracks">
          {subjects.map((s) => (
            <SubjectTrack key={s.id} subject={s} lessons={counts[s.id] ?? 0} />
          ))}
        </div>
      </section>

      {problem && <ProblemOfTheWeek problem={problem} />}

      {latest.length > 0 && (
        <section className="section" aria-labelledby="latest">
          <div className="shead">
            <h2 id="latest">Latest lessons</h2>
          </div>
          <LatestLessons posts={latest} />
        </section>
      )}

      {projects.length > 0 && (
        <section className="section" aria-labelledby="projects">
          <div className="shead">
            <h2 id="projects">Projects</h2>
            <Link className="more" href="/projects">
              All projects
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
