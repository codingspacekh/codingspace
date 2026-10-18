import type { GetStaticPaths, GetStaticProps } from 'next';
import Link from 'next/link';
import { Layout } from '@/components/layout';
import { REVALIDATE } from '@/lib/isr';
import { SUBJECTS } from '@/lib/subjects';
import { getSeriesPage, getSeriesSlugs } from '@/server/data/public';
import type { SeriesPageData } from '@/server/data/types';
import { LessonRow } from '@/views/cards';

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: (await getSeriesSlugs()).map((slug) => ({ params: { slug } })),
  // Series made after the build are rendered on first request, then cached.
  fallback: 'blocking',
});

export const getStaticProps: GetStaticProps<SeriesPageData> = async ({ params }) => {
  const slug = typeof params?.slug === 'string' ? params.slug : '';
  const data = slug ? await getSeriesPage(slug) : null;
  if (!data) return { notFound: true, revalidate: REVALIDATE };
  return { props: data, revalidate: REVALIDATE };
};

/** v1.1 (FR-03): one series: its lessons in order, from whichever subjects they belong to. */
export default function SeriesPage({ slug, title, description, subjects, lessons }: SeriesPageData) {
  return (
    <Layout
      title={`${title} · Series · CodingSpaceKH`}
      description={description || undefined}
      path={`/series/${slug}`}
      active="study"
    >
      <div className="c-pink">
        <header className="phead">
          <div className="phead-copy">
            <nav aria-label="Breadcrumb" className="crumbs">
              <span>Study</span> / <Link href="/series">Series</Link>
            </nav>
            <h1>{title}</h1>
            {description && <p className="lead">{description}</p>}
            <span className="stack">
              {subjects.map((id) => (
                <span key={id} className={`tag c-${SUBJECTS[id].color}`}>
                  {SUBJECTS[id].name}
                </span>
              ))}
              <span className="meta">
                {lessons.length} lesson{lessons.length === 1 ? '' : 's'}
              </span>
            </span>
          </div>
          <div className="big" aria-hidden="true">
            ⇢
          </div>
        </header>
        <ol className="series-lessons" aria-label={`${title}, in order`}>
          {lessons.map((l, i) => (
            <li key={l.slug} className={l.subject ? `c-${SUBJECTS[l.subject].color}` : undefined}>
              <span className="sn" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                {l.subject && <span className="tag">{SUBJECTS[l.subject].name}</span>}
                <LessonRow lesson={l} />
              </div>
            </li>
          ))}
        </ol>
        <p>
          <Link href={`/posts/${lessons[0]!.slug}`} className="btn pri">
            Start with part 1 →
          </Link>
        </p>
      </div>
    </Layout>
  );
}
