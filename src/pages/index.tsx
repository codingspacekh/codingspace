import type { GetStaticProps } from 'next';
import Link from 'next/link';
import { Layout } from '@/components/layout';
import { REVALIDATE } from '@/lib/isr';
import { SUBJECT_IDS, type SubjectId } from '@/lib/subjects';
import { getFeaturedProblem, getLatestLessons, getLessonCounts, getProjects } from '@/server/data/public';
import type { FeaturedProblem, PostCard, Project } from '@/server/data/types';
import { Decipher, OrbitHero, Stagger } from '@/ui';
import { PostTile, ProjectCard, SubjectTrack } from '@/views/cards';
import { ProblemOfTheWeek } from '@/views/problem-of-the-week';

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

export default function Home({ counts, latest, problem, projects }: Props) {
  return (
    <Layout
      title="CodingSpaceKH · Competition maths, physics, coding and IT"
      description="Lessons in competition maths, physics, coding and Cambridge IT, written up so students can review them anytime."
      path="/"
      active="home"
    >
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Link established · student terminal</span>
          <h1 className="headline" aria-label="Math is my love. Physics is my crush. Coding is my life.">
            <Stagger>
              <Decipher className="w1">Math is my love.</Decipher>
              <Decipher className="w2">Physics is my crush.</Decipher>
              <Decipher className="w3">Coding is my life.</Decipher>
            </Stagger>
          </h1>
          {/* Body copy is never wrapped in an animator: readable on first paint. */}
          <p className="intro" data-testid="intro">
            A personal site to share educational content on Math, Physics, Coding and my personal life.
          </p>
          <div className="cta">
            <Link className="btn pri" href="/study/math">
              Start studying →
            </Link>
            <Link className="btn" href="/author">
              Meet the author →
            </Link>
          </div>
          <p className="hint" aria-hidden="true">
            ↘ The orbit is live: tap a subject to open it
          </p>
        </div>
        <OrbitHero />
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
