import Head from 'next/head';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME } from '@/lib/seo';
import { SUBJECT_IDS, SUBJECTS } from '@/lib/subjects';
import { Backdrop, SkipLink, Stagger, TopBar, type NavItem } from '@/ui';

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
      <Stagger>
        <Backdrop />
        <TopBar active={active} />
        <main id="main" tabIndex={-1} className="wrap">
          {children}
        </main>
      </Stagger>
      <footer className="site-footer">
        <div className="footer-inner">
          <span>© 2026 codingspace.io · Teach · Build · Live</span>
          {/* Plain links: the Study menu needs JavaScript, these don't. */}
          <nav aria-label="Subjects" className="footer-links">
            {SUBJECT_IDS.map((id) => (
              <Link key={id} href={`/study/${id}`}>
                {SUBJECTS[id].name}
              </Link>
            ))}
            <Link href="/projects">Projects</Link>
            <Link href="/author">Author</Link>
            <a href="/rss.xml">RSS</a>
          </nav>
        </div>
      </footer>
    </>
  );
}
