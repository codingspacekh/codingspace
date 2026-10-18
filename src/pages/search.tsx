import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { FormEvent } from 'react';
import { Layout } from '@/components/layout';
import { formatDate } from '@/lib/format';
import { cleanQuery, snippetParts } from '@/lib/search-text';
import { SUBJECTS } from '@/lib/subjects';
import { allowSearch, clientIp, searchPosts, type SearchResult } from '@/server/data/search';

type Props = { q: string; results: SearchResult[] | null; limited: boolean };

/**
 * 03 PUB-09: search across published lessons and posts. A plain GET form, so it works without
 * JavaScript. Answers are cached at the CDN for five minutes per query; past the cache, each
 * visitor gets 30 searches a minute (429 after that).
 */
export const getServerSideProps: GetServerSideProps<Props> = async ({ query, req, res }) => {
  const q = cleanQuery(query.q);
  if (q.length < 2) {
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return { props: { q, results: null, limited: false } };
  }
  if (!(await allowSearch(clientIp(req)))) {
    res.statusCode = 429;
    res.setHeader('Retry-After', '60');
    res.setHeader('Cache-Control', 'no-store');
    return { props: { q, results: null, limited: true } };
  }
  const results = await searchPosts(q);
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  return { props: { q, results, limited: false } };
};

function Snippet({ text }: { text: string }) {
  return (
    <p className="snippet">
      {snippetParts(text).map((p, i) => (p.match ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
    </p>
  );
}

function Result({ r }: { r: SearchResult }) {
  const subject = r.subject ? SUBJECTS[r.subject] : null;
  return (
    <li className={`frame search-hit c-${subject?.color ?? 'pink'}`}>
      <span className="tag">{subject ? subject.name : 'Life'}</span>
      <h2 lang={r.lang}>
        <Link href={`/posts/${r.slug}`}>{r.title}</Link>
      </h2>
      {r.summary && <p lang={r.lang}>{r.summary}</p>}
      {r.snippet && <Snippet text={r.snippet} />}
      <span className="meta">{formatDate(r.publishedAt)}</span>
    </li>
  );
}

export default function Search({ q, results, limited }: Props) {
  const router = useRouter();
  const count = results?.length ?? 0;

  // With JavaScript, a search moves inside the site (page change and loading screen) instead of
  // reloading the whole page. Without it, the form submits as usual.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next = String(new FormData(e.currentTarget).get('q') ?? '');
    void router.push({ pathname: '/search', query: { q: next } });
  }

  return (
    <Layout title={q ? `“${q}” · Search · CodingSpaceKH` : 'Search · CodingSpaceKH'} path="/search" active="search">
      <Head>
        {/* Result pages are for visitors, not for search engines. */}
        <meta name="robots" content="noindex, follow" />
      </Head>
      <header className="phead">
        <div className="phead-copy">
          <span className="crumbs">Search</span>
          <h1>Search lessons</h1>
        </div>
      </header>
      <form role="search" action="/search" method="get" className="search-form" onSubmit={submit}>
        <label htmlFor="search-q" className="sr-only">
          Search lessons
        </label>
        <input
          id="search-q"
          key={q}
          type="search"
          name="q"
          defaultValue={q}
          minLength={2}
          maxLength={100}
          placeholder="e.g. inequality, recursion, VLOOKUP"
          autoComplete="off"
        />
        <button type="submit" className="btn pri">
          Search
        </button>
      </form>

      {limited ? (
        <p role="alert" className="empty">
          That’s a lot of searches in a minute. Please wait a moment and try again.
        </p>
      ) : results === null ? (
        q && <p className="empty">Type at least two letters.</p>
      ) : (
        <>
          <p className="search-count" role="status">
            {count === 0
              ? `Nothing found for “${q}”. Try fewer or shorter words.`
              : `${count === 20 ? 'Top 20' : count} result${count === 1 ? '' : 's'} for “${q}”`}
          </p>
          {count > 0 && (
            <ol className="search-results" aria-label="Results">
              {results.map((r) => (
                <Result key={r.slug} r={r} />
              ))}
            </ol>
          )}
        </>
      )}
    </Layout>
  );
}
