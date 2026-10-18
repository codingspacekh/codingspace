import Head from 'next/head';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME } from '@/lib/seo';
import { useSubjects } from '@/lib/subjects';
import { Backdrop, SkipLink, TopBar, type NavItem } from '@/ui';

export function Layout({
  title,
  description = SITE_DESCRIPTION,
  path,
  ogType = 'website',
  active,
  children,
}: {
  title: string;
  description?: string;
  /** The page's canonical path; leave out for error pages, which should not be indexed or shared. */
  path?: string;
  ogType?: 'website' | 'article';
  active?: NavItem;
  children: ReactNode;
}) {
  const url = path ? absoluteUrl(path) : null;
  const { subjects } = useSubjects();
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        {url && (
          <>
            <link rel="canonical" href={url} />
            <meta property="og:url" content={url} />
            <meta property="og:type" content={ogType} />
            <meta property="og:site_name" content={SITE_NAME} />
            <meta property="og:title" content={title} />
            <meta property="og:description" content={description} />
            <meta name="twitter:card" content="summary" />
          </>
        )}
        <link rel="alternate" type="application/rss+xml" title={`${SITE_NAME} lessons`} href="/rss.xml" />
      </Head>
      <SkipLink />
      <Backdrop />
      <TopBar active={active} />
      <main id="main" tabIndex={-1} className="wrap">
        {children}
      </main>
      <PageSkeleton />
      <footer className="site-footer">
        <div className="footer-inner">
          <span>© 2026 codingspacekh.dev · Teach · Build · Live</span>
          {/* Plain links: the Study menu needs JavaScript, these don't. */}
          <nav aria-label="Subjects" className="footer-links">
            {subjects.map((s) => (
              <Link key={s.id} href={`/study/${s.id}`}>
                {s.name}
              </Link>
            ))}
            <Link href="/series">Series</Link>
            <Link href="/syllabus">Syllabus</Link>
            <Link href="/projects">Projects</Link>
            <Link href="/author">Author</Link>
            <a href="/rss.xml">RSS</a>
          </nav>
        </div>
      </footer>
    </>
  );
}

/**
 * Placeholder cards that shimmer while a page loads (src/ui/page-effects.tsx). Hidden unless
 * html[data-transition='loading'] with motion on; decorative, so screen readers skip it.
 */
function PageSkeleton() {
  return (
    <div className="page-skeleton" aria-hidden="true" data-testid="page-skeleton">
      <div className="sk-inner">
        <span className="sk-line sk-eyebrow" />
        <span className="sk-line sk-title" />
        <span className="sk-line sk-lead" />
        <div className="sk-grid">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="sk-card">
              <span className="sk-line sk-short" />
              <span className="sk-line" />
              <span className="sk-line sk-mid" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
