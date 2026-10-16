import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/admin-api';

type Session = { email: string };

const NAV = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/posts', label: 'Posts' },
  { href: '/admin/sections', label: 'Study structure' },
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

  useEffect(() => {
    api<Session & { error?: string }>('/api/admin/session').then(({ status, data }) => {
      if (status === 200) setSession({ email: data.email });
      else toSignIn(router, data.error === 'expired' ? 'expired' : undefined);
    });
  }, [router]);

  async function signOut(scope: 'local' | 'global') {
    if (scope === 'global' && !window.confirm('Sign out on every device, including this one?')) return;
    await api('/api/auth/sign-out', { method: 'POST', body: { scope } });
    await router.replace('/admin/login');
  }

  return (
    <div className="adm">
      <Head>
        <title>{`${title} · CodingSpace admin`}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <header className="adm-bar">
        <Link href="/admin" className="adm-brand">
          CodingSpace <span>admin</span>
        </Link>
        {session && (
          <nav aria-label="Admin" className="adm-nav">
            {NAV.map((n) => {
              const here = n.href === '/admin' ? router.pathname === '/admin' : router.pathname.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={here ? 'page' : undefined}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
        )}
        {session && (
          <div className="adm-user">
            <span className="meta">{session.email}</span>
            <button type="button" className="btn" onClick={() => signOut('local')}>
              Sign out
            </button>
            <button type="button" className="btn" onClick={() => signOut('global')}>
              Sign out everywhere
            </button>
          </div>
        )}
      </header>
      <main id="main" className="adm-main">
        {session ? children(session) : <p aria-live="polite">Checking your session…</p>}
      </main>
    </div>
  );
}
