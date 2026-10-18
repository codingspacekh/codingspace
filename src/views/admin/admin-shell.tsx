import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/admin-api';
import { SubjectsProvider, type Subject } from '@/lib/subjects';

/** Every subject, hidden ones too: the admin's menus and labels use them. */
type Session = { email: string; subjects: (Subject & { visible: boolean })[] };

/** The admin's pages, grouped as the sidebar shows them. */
const NAV: { group: string; items: { href: string; label: string }[] }[] = [
  {
    group: 'Overview',
    items: [
      { href: '/admin', label: 'Dashboard' },
      { href: '/admin/analytics', label: 'Analytics' },
      { href: '/admin/activity', label: 'Activity' },
    ],
  },
  {
    group: 'Content',
    items: [
      { href: '/admin/posts', label: 'Posts' },
      { href: '/admin/questions', label: 'Questions & comments' },
      { href: '/admin/problems', label: 'Problems' },
      { href: '/admin/media', label: 'Media' },
    ],
  },
  {
    group: 'Study',
    items: [
      { href: '/admin/subjects', label: 'Subjects' },
      { href: '/admin/sections', label: 'Study structure' },
      { href: '/admin/series', label: 'Series' },
      { href: '/admin/syllabus', label: 'Syllabus' },
    ],
  },
  {
    group: 'Site',
    items: [
      { href: '/admin/projects', label: 'Projects' },
      { href: '/admin/author', label: 'Author' },
    ],
  },
];

/** Sends the browser to the sign-in page, remembering where it was. */
export function toSignIn(router: ReturnType<typeof useRouter>, reason?: string) {
  const query: Record<string, string> = { next: router.asPath.split('?')[0]! };
  if (reason) query.reason = reason;
  return router.replace({ pathname: '/admin/login', query });
}

/**
 * Frame for every admin page (client-rendered, noindex). Confirms the session with the server
 * before showing anything; a 401 (signed out, revoked or idle for 12 h) goes back to sign-in.
 */
export function AdminShell({ title, children }: { title: string; children: (session: Session) => ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  // Below 1000 px the sidebar is a panel opened from the top bar.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    api<Session & { error?: string }>('/api/admin/session').then(({ status, data }) => {
      if (status === 200) setSession({ email: data.email, subjects: data.subjects ?? [] });
      else toSignIn(router, data.error === 'expired' ? 'expired' : undefined);
    });
  }, [router]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMenuOpen(false);
      menuButton.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  async function signOut(scope: 'local' | 'global') {
    if (scope === 'global' && !window.confirm('Sign out on every device, including this one?')) return;
    await api('/api/auth/sign-out', { method: 'POST', body: { scope } });
    await router.replace('/admin/login');
  }

  const here = (href: string) => (href === '/admin' ? router.pathname === '/admin' : router.pathname.startsWith(href));

  return (
    <div className={`adm adm--shell${menuOpen ? ' adm--menu-open' : ''}`}>
      <Head>
        <title>{`${title} · CodingSpaceKH admin`}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <header className="adm-bar">
        <Link href="/admin" className="adm-brand">
          CodingSpaceKH <span>admin</span>
        </Link>
        {session && (
          <button
            ref={menuButton}
            type="button"
            className="btn adm-menu-button"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
        )}
      </header>
      <div id={menuId} className="adm-side">
        <Link href="/admin" className="adm-brand adm-side-brand">
          CodingSpaceKH <span>admin</span>
        </Link>
        {session && (
          <>
            <nav aria-label="Admin" className="adm-nav">
              {NAV.map((g) => (
                <div key={g.group} className="adm-nav-group">
                  <p className="adm-nav-head" id={`${menuId}-${g.group}`}>
                    {g.group}
                  </p>
                  <ul aria-labelledby={`${menuId}-${g.group}`}>
                    {g.items.map((n) => (
                      <li key={n.href}>
                        <Link
                          href={n.href}
                          aria-current={here(n.href) ? 'page' : undefined}
                          onClick={() => setMenuOpen(false)}
                        >
                          {n.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
            <div className="adm-user">
              <a href="/" target="_blank" rel="noopener" className="adm-view-site">
                View the site ↗<span className="sr-only"> (opens in a new tab)</span>
              </a>
              <span className="meta adm-email" title={session.email}>
                {session.email}
              </span>
              <button type="button" className="btn" onClick={() => signOut('local')}>
                Sign out
              </button>
              <button type="button" className="btn" onClick={() => signOut('global')}>
                Sign out everywhere
              </button>
            </div>
          </>
        )}
      </div>
      <main id="main" className="adm-main">
        {session ? (
          <SubjectsProvider value={session.subjects}>{children(session)}</SubjectsProvider>
        ) : (
          <p aria-live="polite">Checking your session…</p>
        )}
      </main>
    </div>
  );
}
