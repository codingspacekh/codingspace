import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import { Layout } from '@/components/layout';
import { REVALIDATE } from '@/lib/isr';
import { articleJsonLd, SITE_NAME } from '@/lib/seo';
import { getAuthorName, getPostPage, getPostSlugs } from '@/server/data/public';
import type { PostPageData } from '@/server/data/types';
import { PostView } from '@/views/post-view';

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: (await getPostSlugs()).map((slug) => ({ params: { slug } })),
  // Posts published after the build are rendered on first request, then cached.
  fallback: 'blocking',
});

type Props = PostPageData & { author: string };

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const slug = typeof params?.slug === 'string' ? params.slug : '';
  const [data, author] = await Promise.all([slug ? getPostPage(slug) : null, getAuthorName()]);
  if (!data) return { notFound: true, revalidate: REVALIDATE };
  return { props: { ...data, author: author ?? SITE_NAME }, revalidate: REVALIDATE };
};

export default function PostPage({ author, ...data }: Props) {
  return (
    <Layout
      title={`${data.post.title} · CodingSpace`}
      description={data.post.summary || undefined}
      path={`/posts/${data.post.slug}`}
      ogType="article"
      active={data.post.kind === 'life' ? 'author' : 'study'}
    >
      <Head>
        {/* Structured data for search engines: a data block browsers never execute, so script-src stays strict. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleJsonLd(data.post, { author }) }} />
      </Head>
      <PostView {...data} />
    </Layout>
  );
}
