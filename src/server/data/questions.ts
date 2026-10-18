import type { NextApiRequest } from 'next';
import { db } from './public';
import { clientIp, rateKey } from './search';

/**
 * Questions on lessons and comments on life posts (v1.1): a visitor writes under a post; it waits
 * for the owner's approval. Everything goes through public.ask_question (checks, 5 an hour per
 * visitor, 300 a day, questions and comments together).
 */

export type AskResult = 'ok' | 'limited' | 'not_found' | 'invalid';

export const QUESTION_MAX = { name: 60, body: 2000 } as const;

const str = (v: unknown) => (typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : '');

/** The form's fields, from JSON (the page's script) or a plain form post (no JavaScript). */
export function askFields(body: unknown) {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  return {
    slug: str(b.post).trim(),
    name: str(b.name).trim(),
    question: str(b.question).trim(),
    // Only for the way back after a plain form post: comments on life posts, questions otherwise.
    anchor: str(b.kind) === 'life' ? 'comments' : 'questions',
    // The honeypot: hidden from people, filled in by bots.
    website: str(b.website),
  };
}

export async function askQuestion(req: NextApiRequest): Promise<AskResult> {
  const f = askFields(req.body);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.slug)) return 'invalid';
  if (!f.name || f.name.length > QUESTION_MAX.name || !f.question || f.question.length > QUESTION_MAX.body)
    return 'invalid';
  // A bot filled the hidden field: say thanks, keep nothing.
  if (f.website) return 'ok';
  const key = rateKey(
    clientIp(req),
    new Date(),
    process.env.QUESTION_SALT ?? process.env.SEARCH_SALT ?? 'codingspace-questions',
  );
  const { data, error } = await db().rpc('ask_question', {
    p_slug: f.slug,
    p_name: f.name,
    p_body: f.question,
    p_key: key,
  });
  if (error) {
    if (error.code === 'PT422') return 'invalid';
    throw new Error(`ask_question: ${error.message}`);
  }
  return data as AskResult;
}
