import type { NextApiRequest, NextApiResponse } from 'next';
import { isSameOrigin } from '@/server/auth/guard';
import { askFields, askQuestion } from '@/server/data/questions';

// A question is a few kilobytes at most.
export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };

/**
 * POST { post, name, question, website } → a question under a lesson (or a comment under a life
 * post), held for the owner (v1.1). JSON from the page's script gets { result }; a plain form post
 * (no JavaScript, also sends kind) goes back to the post with ?asked=<result>#questions (#comments).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  // Another site's page can't post questions.
  if (!isSameOrigin(req.method, req.headers)) return res.status(403).json({ error: 'bad_origin' });
  const form = !String(req.headers['content-type'] ?? '').includes('application/json');
  let result;
  try {
    result = await askQuestion(req);
  } catch (e) {
    console.error(e);
    result = 'error' as const;
  }
  if (form) {
    const { slug, anchor } = askFields(req.body);
    const back = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? `/posts/${slug}` : '/';
    return res.redirect(303, `${back}?asked=${result}#${anchor}`);
  }
  const status = { ok: 200, limited: 429, not_found: 404, invalid: 400, error: 500 }[result];
  return res.status(status).json({ result });
}
