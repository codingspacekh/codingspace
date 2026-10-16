import { createServerClient, serializeCookieHeader, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { NextRequest, NextResponse } from 'next/server';

/**
 * Supabase clients for the admin, bound to the request's session cookies.
 *
 * The browser never talks to Supabase: sign-in and every admin call go through our own
 * API routes, so the session cookies can be HttpOnly (03 §8.2) and the CSP keeps
 * connect-src at 'self'.
 */

/** Cookies are dropped after 12 h without a token refresh; admin_touch() is the real idle check. */
const MAX_AGE_SECONDS = 12 * 60 * 60;

export function cookieOptions(secure: boolean): CookieOptions {
  return { path: '/', httpOnly: true, sameSite: 'lax', secure, maxAge: MAX_AGE_SECONDS };
}

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.');
  return { url, key };
}

const isHttps = (proto: string | string[] | undefined, fallback: boolean) =>
  proto === undefined ? fallback : String(proto).split(',')[0]!.trim() === 'https';

/** For API routes (Pages Router). Create one per request. */
export function apiClient(req: NextApiRequest, res: NextApiResponse): SupabaseClient {
  const { url, key } = env();
  const secure = isHttps(req.headers['x-forwarded-proto'], false);
  return createServerClient(url, key, {
    cookieOptions: cookieOptions(secure),
    cookies: {
      getAll: () => Object.entries(req.cookies).map(([name, value]) => ({ name, value: value ?? '' })),
      setAll: (cookies, headers) => {
        const previous = res.getHeader('Set-Cookie');
        const kept = previous === undefined ? [] : Array.isArray(previous) ? previous : [String(previous)];
        res.setHeader('Set-Cookie', [
          ...kept,
          ...cookies.map(({ name, value, options }) => serializeCookieHeader(name, value, options)),
        ]);
        for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
      },
    },
  });
}

/** For the proxy (src/proxy.ts). Refreshed tokens go to both the request and the response. */
export function proxyClient(request: NextRequest, getResponse: () => NextResponse): SupabaseClient {
  const { url, key } = env();
  const secure = isHttps(request.headers.get('x-forwarded-proto') ?? undefined, request.nextUrl.protocol === 'https:');
  return createServerClient(url, key, {
    cookieOptions: cookieOptions(secure),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies, headers) => {
        for (const { name, value } of cookies) request.cookies.set(name, value);
        const response = getResponse();
        for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
      },
    },
  });
}
