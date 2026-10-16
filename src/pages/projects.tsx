import type { GetStaticProps } from 'next';
import { Layout } from '@/components/layout';
import { REVALIDATE } from '@/lib/isr';
import { getProjects } from '@/server/data/public';
import type { Project } from '@/server/data/types';
import { ProjectCard } from '@/views/cards';

type Props = { projects: Project[] };

export const getStaticProps: GetStaticProps<Props> = async () => ({
  props: { projects: await getProjects() },
  revalidate: REVALIDATE,
});

export default function Projects({ projects }: Props) {
  return (
    <Layout
      title="Projects · CodingSpace"
      description="Free tools for practising what we learn in class."
      path="/projects"
      active="projects"
    >
      <header className="phead c-lime">
        <div className="phead-copy">
          <span className="crumbs">Projects</span>
          <h1>Software I build for my classes</h1>
          <p className="lead">
            Free tools for practising what we learn in class. Each one has its own site with downloads, guides and
            updates.
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
