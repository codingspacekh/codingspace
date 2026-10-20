import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import { Layout } from '@/components/layout';
import { REVALIDATE } from '@/lib/isr';
import { downloadUrl } from '@/lib/project-page';
import { SITE_NAME, softwareJsonLd } from '@/lib/seo';
import type { Subject } from '@/lib/subjects';
import { getAuthorName, getProjectPage, getProjectSlugs, getSubjects } from '@/server/data/public';
import type { ProjectPageData } from '@/server/data/types';
import { ProjectPage } from '@/views/project-page';

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: (await getProjectSlugs()).map((slug) => ({ params: { slug } })),
  // Projects added after the build are rendered on first request, then cached.
  fallback: 'blocking',
});

type Props = ProjectPageData & { author: string; subjects: Subject[] };

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const slug = typeof params?.slug === 'string' ? params.slug : '';
  const [data, author, subjects] = await Promise.all([
    slug ? getProjectPage(slug) : null,
    getAuthorName(),
    getSubjects(),
  ]);
  if (!data) return { notFound: true, revalidate: REVALIDATE };
  return { props: { ...data, author: author ?? SITE_NAME, subjects }, revalidate: REVALIDATE };
};

export default function ProjectRoute({ author, ...page }: Props) {
  const p = page.project;
  return (
    <Layout
      title={`${p.name} · Projects · CodingSpaceKH`}
      description={page.tagline || p.description}
      path={`/projects/${p.slug}`}
      active="projects"
    >
      <Head>
        {/* Structured data for search engines: a data block browsers never execute, so script-src stays strict. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: softwareJsonLd(
              {
                slug: p.slug,
                name: p.name,
                description: page.tagline || p.description,
                platforms: p.platforms,
                version: page.version,
                downloadUrl: page.downloads[0] ? downloadUrl(page.downloads[0]) : null,
              },
              { author },
            ),
          }}
        />
      </Head>
      <ProjectPage {...page} />
    </Layout>
  );
}
