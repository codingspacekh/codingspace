import Head from 'next/head';
import type { ReactNode } from 'react';
import { Backdrop, SkipLink, Stagger, TopBar } from '@/ui';

export function Layout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <SkipLink />
      <Stagger>
        <Backdrop />
        <TopBar />
        <main id="main" tabIndex={-1} className="wrap">
          {children}
        </main>
      </Stagger>
      <footer className="site-footer">© 2026 codingspace.io · Teach · Build · Live</footer>
    </>
  );
}
