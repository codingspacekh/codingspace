import type { NextApiRequest, NextApiResponse } from 'next';
import { isSameOrigin } from '@/server/auth/guard';
import { getQuestionsPage, getQuestionsPost, isQuestionCursor } from '@/server/data/public';
import { askFields, askQuestion } from '@/server/data/questions';
import { isSlug } from '@/lib/slug';

// A question is a few kilobytes at most.
export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };

/**
 * GET ?post=<slug>&before=<published_at> → { questions, more }: the next page of older questions
 * (comments) under a live post, for "Show older". Public, so cached at the CDN for a minute.
 *
 * POST { post, name, question, website } → a question under a lesson (or a comment under a life
 * post), held for the owner (v1.1). JSON from the page's script gets { result }; a plain form post
 * (no JavaScript, also sends kind) goes back to the post with ?asked=<result>#questions (#comments).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') return older(req, res);
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
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
    const back = isSlug(slug) ? `/posts/${slug}` : '/';
    return res.redirect(303, `${back}?asked=${result}#${anchor}`);
  }
  const status = { ok: 200, limited: 429, not_found: 404, invalid: 400, error: 500 }[result];
  return res.status(status).json({ result });
}

async function older(req: NextApiRequest, res: NextApiResponse) {
  const slug = typeof req.query.post === 'string' ? req.query.post : '';
  const before = typeof req.query.before === 'string' ? req.query.before : '';
  if (!isSlug(slug) || !isQuestionCursor(before)) {
    res.setHeader('Cache-Control', 'public, s-maxage=3600');
    return res.status(400).json({ error: 'bad_request' });
  }
  try {
    const post = await getQuestionsPost(slug);
    if (!post) {
      res.setHeader('Cache-Control', 'public, s-maxage=60');
      return res.status(404).json({ error: 'not_found' });
    }
    const page = await getQuestionsPage(post.id, before);
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(page);
  } catch (e) {
    console.error(e);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(500).json({ error: 'server_error' });
  }
}
