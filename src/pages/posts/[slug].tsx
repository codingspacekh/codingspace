import type { GetStaticPaths, GetStaticProps } from 'next';
import { Layout } from '@/components/layout';
import { REVALIDATE } from '@/lib/isr';
import { getPostPage, getPostSlugs } from '@/server/data/public';
import type { PostPageData } from '@/server/data/types';
import { PostView } from '@/views/post-view';

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: (await getPostSlugs()).map((slug) => ({ params: { slug } })),
  // Posts published after the build are rendered on first request, then cached.
  fallback: 'blocking',
});

export const getStaticProps: GetStaticProps<PostPageData> = async ({ params }) => {
  const slug = typeof params?.slug === 'string' ? params.slug : '';
  const data = slug ? await getPostPage(slug) : null;
  if (!data) return { notFound: true, revalidate: REVALIDATE };
  return { props: data, revalidate: REVALIDATE };
};

export default function PostPage(data: PostPageData) {
  return (
    <Layout
      title={`${data.post.title} · CodingSpace`}
      description={data.post.summary || undefined}
      active={data.post.kind === 'life' ? 'author' : 'study'}
    >
      <PostView {...data} />
    </Layout>
  );
}
