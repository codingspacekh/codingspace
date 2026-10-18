import { createHash } from 'node:crypto';
import type { NextApiRequest } from 'next';
import { z } from 'zod';
import { deviceOf, isBot, sourceOf, trackedPath } from '@/lib/analytics';
import { db } from './public';
import { clientIp } from './search';

/**
 * Records page views and reading time for the owner's analytics (v1.1, NFR-PRIV-1).
 * No cookies, nothing in the browser: the visitor is a hash of address + browser, which
 * public.track_view salts again with a random salt of the day (deleted the next day).
 */

const View = z.object({
  id: z.uuid(),
  path: z.string().max(200),
  referrer: z.string().max(2000).optional(),
});
const Time = z.object({ id: z.uuid(), seconds: z.number().int().min(1).max(86_400) });

/** The address + browser, hashed before it leaves the server (the database never sees either). */
export function clientHash(
  ip: string,
  ua: string,
  pepper = process.env.ANALYTICS_SALT ?? 'codingspace-visits',
): string {
  return createHash('sha256').update(`${pepper}\n${ip}\n${ua}`).digest('hex');
}

const header = (req: NextApiRequest, name: string) => {
  const v = req.headers[name];
  return (Array.isArray(v) ? v[0] : v) ?? '';
};

/** The owner's own visits don't count: only the owner has a session cookie on this site. */
const signedIn = (req: NextApiRequest) =>
  Object.keys(req.cookies ?? {}).some((n) => /^sb-.+-auth-token(\.\d+)?$/.test(n));

export type VisitResult = 'recorded' | 'ignored' | 'invalid';

export async function recordVisit(req: NextApiRequest): Promise<VisitResult> {
  let body: unknown = req.body;
  // navigator.sendBeacon posts text/plain.
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return 'invalid';
    }
  }
  const ua = header(req, 'user-agent');
  if (isBot(ua) || signedIn(req)) return 'ignored';

  const time = Time.safeParse(body);
  if (time.success) {
    const { error } = await db().rpc('track_time', { p_id: time.data.id, p_seconds: time.data.seconds });
    if (error) throw new Error(`track_time: ${error.message}`);
    return 'recorded';
  }

  const view = View.safeParse(body);
  if (!view.success) return 'invalid';
  const path = trackedPath(view.data.path);
  if (!path) return 'ignored';
  const country = header(req, 'x-vercel-ip-country').toUpperCase();
  const { data, error } = await db().rpc('track_view', {
    p_id: view.data.id,
    p_client: clientHash(clientIp(req), ua),
    p_path: path,
    p_source: sourceOf(view.data.referrer, header(req, 'x-forwarded-host') || header(req, 'host')),
    p_device: deviceOf(ua),
    p_country: /^[A-Z]{2}$/.test(country) && country !== 'XX' ? country : null,
  });
  if (error) throw new Error(`track_view: ${error.message}`);
  return data === true ? 'recorded' : 'ignored';
}
