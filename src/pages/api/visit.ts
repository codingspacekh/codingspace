import type { NextApiRequest, NextApiResponse } from 'next';
import { isSameOrigin } from '@/server/auth/guard';
import { recordVisit } from '@/server/data/analytics';

// A page view is a few hundred bytes; anything bigger isn't one.
export const config = { api: { bodyParser: { sizeLimit: '2kb' } } };

/**
 * POST { id, path, referrer? } → a page view; POST { id, seconds } → its reading time so far.
 * Always 204 for a well-formed request (whether it counted or not), and analytics never
 * shows an error to a visitor: a failure is only logged.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  // Another site's page can't post views. (Unlike the admin, a missing Origin is fine: some
  // browsers leave it out of same-site beacons, and nothing here acts on a session.)
  if (req.headers.origin && !isSameOrigin(req.method, req.headers))
    return res.status(403).json({ error: 'bad_origin' });
  try {
    if ((await recordVisit(req)) === 'invalid') return res.status(400).json({ error: 'invalid_request' });
  } catch (e) {
    console.error(e);
  }
  return res.status(204).end();
}
