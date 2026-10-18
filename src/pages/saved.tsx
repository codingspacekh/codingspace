import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { Layout } from '@/components/layout';
import { formatDate } from '@/lib/format';
import { REVALIDATE } from '@/lib/isr';
import { useSubjects, type Subject } from '@/lib/subjects';
import { getSubjects } from '@/server/data/public';
import { unsavePost, useHydrated, useSaved } from '@/ui';

export const getStaticProps: GetStaticProps<{ subjects: Subject[] }> = async () => ({
  props: { subjects: await getSubjects() },
  revalidate: REVALIDATE,
});

/**
 * The lessons and posts this visitor saved (☆ Save on a post). The list lives in this browser
 * only, so the page is the same empty shell for everyone until the browser fills it in.
 */
export default function SavedPage() {
  const saved = useSaved();
  const ready = useHydrated();
  const { subjects, subject: subjectOf } = useSubjects();
  const first = subjects[0];

  return (
    <Layout title="Saved lessons · CodingSpaceKH" active="saved">
      <Head>
        {/* Every visitor's list is different and private: nothing here for search engines. */}
        <meta name="robots" content="noindex" />
      </Head>
      <div className="c-cyan">
        <header className="phead">
          <div className="phead-copy">
            <span className="crumbs">Saved</span>
            <h1>Saved lessons</h1>
            <p className="lead">
              Lessons you saved with ☆ Save. They are kept on this device, in this browser only: another phone or
              computer, a private window or clearing your browsing data starts with an empty list.
            </p>
          </div>
          <div className="big" aria-hidden="true">
            ★
          </div>
        </header>
        {!ready ? (
          <p aria-live="polite">Loading your saved lessons…</p>
        ) : saved.length === 0 ? (
          <p className="empty saved-empty">
            Nothing saved yet. Open a lesson and press ☆ Save to keep it here.{' '}
            {first ? (
              <Link href={`/study/${first.id}`}>Start with {first.name}</Link>
            ) : (
              <Link href="/">Back to home</Link>
            )}
          </p>
        ) : (
          <ul className="saved-list" aria-label="Your saved lessons">
            {saved.map((p) => {
              const subject = subjectOf(p.subject);
              return (
                <li key={p.slug} className={`frame c-${subject?.color ?? 'pink'}`}>
                  <span className="tag">{subject?.name ?? 'Life'}</span>
                  <Link href={`/posts/${p.slug}`} lang={p.lang} className="saved-title">
                    {p.title}
                  </Link>
                  <span className="meta">Saved {formatDate(p.savedAt)}</span>
                  <button
                    type="button"
                    className="ui-toggle"
                    aria-label={`Remove ${p.title}`}
                    onClick={() => unsavePost(p.slug)}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Layout>
  );
}
