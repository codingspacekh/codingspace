import { NextResponse, type NextRequest } from 'next/server';
import { proxyClient } from '@/server/auth/clients';

/**
 * First gate for the admin (03 §6, ADM-01): cheap checks on the session cookie only.
 * The full owner check (allow-list, revoked, 12 h idle) runs in every /api/admin route
 * (withOwner), and RLS runs under that. Security headers come from next.config.mjs.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = proxyClient(request, () => (response = NextResponse.next({ request })));
  // Also refreshes an expired access token and writes the new cookies to `response`.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims?.sub ? data.claims : null;
  const twoFactor = claims?.aal === 'aal2';
  const path = request.nextUrl.pathname;

  const finish = (res: NextResponse) => {
    for (const cookie of response.cookies.getAll()) res.cookies.set(cookie);
    res.headers.set('Cache-Control', 'private, no-store');
    // Stays after launch, when the site-wide noindex goes away.
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return res;
  };

  if (path.startsWith('/api/admin')) {
    if (!claims) return finish(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }));
    if (!twoFactor) return finish(NextResponse.json({ error: 'mfa_required' }, { status: 403 }));
    return finish(response);
  }

  if (path === '/admin/login') {
    return finish(twoFactor ? NextResponse.redirect(new URL('/admin', request.url)) : response);
  }
  if (!twoFactor) {
    const login = new URL('/admin/login', request.url);
    login.searchParams.set('next', path);
    return finish(NextResponse.redirect(login));
  }
  return finish(response);
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/admin/:path*'],
};
