import type { SupabaseClient } from '@supabase/supabase-js';
import type { IncomingHttpHeaders } from 'node:http';
import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import { apiClient } from './clients';

/**
 * The admin gate (03 ADM-01, §8.2–8.4). Three layers, each enough on its own to stop a write:
 *   1. src/proxy.ts: no session → 401 / login page; no 2FA → 403.
 *   2. withOwner() here: session + AAL2 + owner allow-list + not revoked + 12 h idle (admin_touch()).
 *   3. RLS: private.is_owner() on every table.
 */

export type Denied = 'unauthenticated' | 'revoked' | 'expired' | 'mfa_required' | 'forbidden' | 'bad_origin';
export type Owner = { userId: string; email: string };
export type OwnerCheck = ({ ok: true } & Owner) | { ok: false; status: 401 | 403; error: Denied };

const deny = (status: 401 | 403, error: Denied): OwnerCheck => ({ ok: false, status, error });

/** Session claims, or null when there is no valid session. Refreshes an expired access token. */
export async function sessionClaims(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims;
}

export async function checkOwner(supabase: SupabaseClient): Promise<OwnerCheck> {
  const claims = await sessionClaims(supabase);
  if (!claims) return deny(401, 'unauthenticated');
  if (claims.aal !== 'aal2') return deny(403, 'mfa_required');

  const { data, error } = await supabase.rpc('admin_touch');
  if (error) {
    // PostgREST rejects a token the auth server has revoked or that no longer verifies.
    if (error.code === 'PGRST301' || error.code === 'PGRST303') return deny(401, 'revoked');
    throw new Error(`admin_touch: ${error.message}`);
  }
  switch (data) {
    case 'ok':
      return { ok: true, userId: claims.sub, email: typeof claims.email === 'string' ? claims.email : '' };
    case 'expired':
      // End it for good, so the refresh token can't be used either.
      await supabase.auth.signOut({ scope: 'local' });
      return deny(401, 'expired');
    case 'revoked':
      return deny(401, 'revoked');
    default:
      return deny(403, 'forbidden');
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF check for state-changing requests (03 §8.2): the Origin header must be this site.
 * Browsers send Origin on every cross-site POST/PUT/PATCH/DELETE, so a missing one is refused too.
 */
export function isSameOrigin(method: string | undefined, headers: IncomingHttpHeaders): boolean {
  if (SAFE_METHODS.has((method ?? 'GET').toUpperCase())) return true;
  const origin = headers.origin;
  const host = headers['x-forwarded-host'] ?? headers.host;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === String(host).split(',')[0]!.trim();
  } catch {
    return false;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type OwnerContext = { supabase: SupabaseClient; owner: Owner };
export type OwnerHandler = (req: NextApiRequest, res: NextApiResponse, ctx: OwnerContext) => unknown;

/** Marks handlers built by withOwner(); a unit test checks every /api/admin route has it. */
export const OWNER_GUARD = Symbol.for('codingspace.ownerGuard');
export type GuardedHandler = NextApiHandler & { [OWNER_GUARD]: true };

function noStore(res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
}

/** Wraps every /api/admin/* route. The auth check runs before the method check, for every method. */
export function withOwner(methods: Method[], handler: OwnerHandler): GuardedHandler {
  const guarded = (async (req, res) => {
    noStore(res);
    if (!isSameOrigin(req.method, req.headers)) return res.status(403).json({ error: 'bad_origin' });
    const supabase = apiClient(req, res);
    const check = await checkOwner(supabase);
    if (!check.ok) return res.status(check.status).json({ error: check.error });
    if (!methods.includes(req.method as Method)) {
      res.setHeader('Allow', methods.join(', '));
      return res.status(405).json({ error: 'method_not_allowed' });
    }
    await handler(req, res, { supabase, owner: { userId: check.userId, email: check.email } });
  }) as GuardedHandler;
  guarded[OWNER_GUARD] = true;
  return guarded;
}

/** For the sign-in routes (/api/auth/*): same-origin, no caching, allowed methods only. */
export function withAuthRoute(
  methods: Method[],
  handler: (req: NextApiRequest, res: NextApiResponse, supabase: SupabaseClient) => unknown,
): NextApiHandler {
  return async (req, res) => {
    noStore(res);
    if (!methods.includes(req.method as Method)) {
      res.setHeader('Allow', methods.join(', '));
      return res.status(405).json({ error: 'method_not_allowed' });
    }
    if (!isSameOrigin(req.method, req.headers)) return res.status(403).json({ error: 'bad_origin' });
    await handler(req, res, apiClient(req, res));
  };
}
