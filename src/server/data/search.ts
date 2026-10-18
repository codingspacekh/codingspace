import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { SubjectId } from '@/lib/subjects';
import { db } from './public';

/** Search across published posts (03 PUB-09); the ranking lives in public.search_posts. */

export type SearchResult = {
  slug: string;
  kind: 'lesson' | 'life';
  subject: SubjectId | null;
  lang: 'en' | 'km';
  title: string;
  summary: string;
  publishedAt: string;
  snippet: string;
};

type Row = {
  slug: string;
  kind: 'lesson' | 'life';
  subject_id: string | null;
  lang: 'en' | 'km';
  title: string;
  summary: string | null;
  published_at: string;
  snippet: string | null;
};

export async function searchPosts(q: string, limit = 20): Promise<SearchResult[]> {
  const { data, error } = await db().rpc('search_posts', { p_q: q, p_limit: limit });
  if (error) throw new Error(`search_posts: ${error.message}`);
  return ((data ?? []) as Row[]).map((r) => ({
    slug: r.slug,
    kind: r.kind,
    subject: r.subject_id,
    lang: r.lang,
    title: r.title,
    summary: r.summary ?? '',
    publishedAt: r.published_at,
    snippet: r.snippet ?? '',
  }));
}

/** The visitor's address as Vercel reports it (first x-forwarded-for entry). */
export function clientIp(req: Pick<IncomingMessage, 'headers' | 'socket'>): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  const real = req.headers['x-real-ip'];
  return first || (Array.isArray(real) ? real[0] : real) || req.socket?.remoteAddress || 'unknown';
}

/**
 * The rate-limit key: a hash of the address with a salt that changes every day, so the
 * database never holds an address, and keys can't be linked across days (NFR-PRIV-1).
 */
export function rateKey(ip: string, now = new Date(), salt = process.env.SEARCH_SALT ?? 'codingspace-search'): string {
  return createHash('sha256')
    .update(`${salt}:${now.toISOString().slice(0, 10)}:${ip}`)
    .digest('hex');
}

/** 30 searches a minute per visitor. If the check itself fails, search stays available. */
export async function allowSearch(ip: string): Promise<boolean> {
  const { data, error } = await db().rpc('search_rate_ok', { p_key: rateKey(ip) });
  if (error) {
    console.error('search_rate_ok', error.message);
    return true;
  }
  return data === true;
}
