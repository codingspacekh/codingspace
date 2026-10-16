import Head from 'next/head';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SUBJECT_IDS, SUBJECTS } from '@/lib/subjects';
import { Backdrop, SkipLink, Stagger, TopBar, type NavItem } from '@/ui';

export function Layout({
  title,
  description,
  active,
  children,
}: {
  title: string;
  description?: string;
  active?: NavItem;
  children: ReactNode;
}) {
  return (
    <>
      <Head>
        <title>{title}</title>
        {description && <meta name="description" content={description} />}
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
          </nav>
        </div>
      </footer>
    </>
  );
}
