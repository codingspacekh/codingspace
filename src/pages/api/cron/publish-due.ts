import type { NextApiRequest, NextApiResponse } from 'next';
import { cronAuthorized, serviceClient } from '@/server/admin/cron';
import { revalidate } from '@/server/admin/http';
import { publishDuePosts } from '@/server/admin/posts';

/** GET (Bearer CRON_SECRET) → { published, failed }: publishes due scheduled posts and rebuilds their pages. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!process.env.CRON_SECRET) return res.status(503).json({ error: 'cron_not_configured' });
  if (!cronAuthorized(req.headers.authorization)) return res.status(401).json({ error: 'unauthorized' });
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  try {
    const { published, failed } = await publishDuePosts(serviceClient());
    const paths = [...new Set(published.flatMap((p) => p.paths))];
    const { failed: notRefreshed } = await revalidate(res, paths);
    res.status(200).json({ published: published.map((p) => p.slug), failed, notRefreshed });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
}
