import type { GetStaticProps } from 'next';
import { Layout } from '@/components/layout';
import { REVALIDATE } from '@/lib/isr';
import type { Subject } from '@/lib/subjects';
import { getProjects, getSubjects } from '@/server/data/public';
import type { Project } from '@/server/data/types';
import { ProjectCard } from '@/views/cards';

type Props = { projects: Project[]; subjects: Subject[] };

export const getStaticProps: GetStaticProps<Props> = async () => {
  const [projects, subjects] = await Promise.all([getProjects(), getSubjects()]);
  return { props: { projects, subjects }, revalidate: REVALIDATE };
};

export default function Projects({ projects }: Props) {
  return (
    <Layout
      title="Projects · CodingSpaceKH"
      description="Free tools for practising what we learn in class."
      path="/projects"
      active="projects"
    >
      <header className="phead c-lime">
        <div className="phead-copy">
          <span className="crumbs">Projects</span>
          <h1>Software I build for my classes</h1>
          <p className="lead">
            Free tools for practising what we learn in class. Each one has its own page with what it does, screenshots
            and downloads.
          </p>
        </div>
        <div className="big" aria-hidden="true">
          {'{ }'}
        </div>
      </header>
      {projects.length > 0 ? (
        <div className="grid2">
          {projects.map((p) => (
            <ProjectCard key={p.slug} project={p} />
          ))}
        </div>
      ) : (
        <p className="empty">Projects are coming soon.</p>
      )}
    </Layout>
  );
}
