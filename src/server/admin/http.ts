import type { NextApiResponse } from 'next';
import { ZodError } from 'zod';
import { PostError } from './posts';

/** Sends a refused change as its HTTP status; anything else is a 500 (and logged). */
export function sendError(res: NextApiResponse, e: unknown) {
  if (e instanceof PostError) return res.status(e.status).json({ error: e.message });
  if (e instanceof ZodError) return res.status(400).json({ error: 'invalid_request' });
  console.error(e);
  return res.status(500).json({ error: 'server_error' });
}

/** Pages rebuilt at once: a subject change rebuilds every public page. */
const AT_ONCE = 10;

/**
 * Rebuilds static pages after a change (03 §6.3). A failed page doesn't fail the change:
 * it is listed in the reply and the page refreshes on its own within 5 minutes (ISR).
 */
export async function revalidate(res: NextApiResponse, paths: string[]): Promise<{ failed: string[] }> {
  const results: PromiseSettledResult<void>[] = [];
  for (let i = 0; i < paths.length; i += AT_ONCE) {
    results.push(...(await Promise.allSettled(paths.slice(i, i + AT_ONCE).map((p) => res.revalidate(p)))));
  }
  const failed = paths.filter((_, i) => results[i]!.status === 'rejected');
  if (failed.length) console.error('revalidate failed for', failed);
  return { failed };
}
