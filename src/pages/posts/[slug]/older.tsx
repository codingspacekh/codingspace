import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { Layout } from '@/components/layout';
import type { Subject } from '@/lib/subjects';
import { getQuestionsPage, getQuestionsPost, getSubjects, isQuestionCursor } from '@/server/data/public';
import type { LessonQuestion } from '@/server/data/types';
import { olderHref, olderLabel, QuestionList } from '@/views/lesson-questions';

type Props = {
  post: { slug: string; title: string; kind: 'lesson' | 'life' };
  questions: LessonQuestion[];
  more: number;
  subjects: Subject[];
};

/**
 * v1.1: older questions under a lesson (comments under a life post), 20 at a time, for visitors
 * without JavaScript; with it, "Show older" loads them in place on the post. Cached at the CDN for
 * a minute, and kept out of search results (the post itself is the page to find).
 */
export const getServerSideProps: GetServerSideProps<Props> = async ({ params, query, res }) => {
  const slug = typeof params?.slug === 'string' ? params.slug : '';
  const before = typeof query.before === 'string' ? query.before : '';
  if (!isQuestionCursor(before)) return { redirect: { destination: `/posts/${slug}`, permanent: false } };
  const [post, subjects] = await Promise.all([getQuestionsPost(slug), getSubjects()]);
  if (!post) return { notFound: true };
  const page = await getQuestionsPage(post.id, before);
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  return {
    props: { post: { slug: post.slug, title: post.title, kind: post.kind }, ...page, subjects },
  };
};

export default function OlderQuestions({ post, questions, more }: Props) {
  const noun = post.kind === 'life' ? 'comments' : 'questions';
  return (
    <Layout title={`Older ${noun} · ${post.title} · CodingSpaceKH`} active={post.kind === 'life' ? 'author' : 'study'}>
      <Head>
        <meta name="robots" content="noindex" />
        {questions.some((q) => q.hasMath) && <link rel="stylesheet" href="/katex/katex.min.css" />}
      </Head>
      <nav aria-label="Breadcrumb" className="crumbs">
        <Link href={`/posts/${post.slug}#${noun}`}>← {post.title}</Link>
      </nav>
      <section className="questions" aria-labelledby="older-h">
        <h1 id="older-h">
          Older {noun} on {post.title}
        </h1>
        {questions.length > 0 ? <QuestionList questions={questions} /> : <p className="meta">No older {noun}.</p>}
        {more > 0 && (
          <p className="q-more">
            <a className="btn" href={olderHref(post.slug, questions)}>
              {olderLabel(post.kind, more)}
            </a>
          </p>
        )}
      </section>
    </Layout>
  );
}
