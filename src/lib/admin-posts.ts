/**
 * Shared by the posts list (03 ADM-03) and the dashboard (ADM-02), client and server.
 * No zod here: it probes eval() when it loads, which the CSP blocks in the browser.
 */

import type { ActivityEvent } from './activity';
import { SUBJECT_ID } from './subjects';

export type PostKind = 'lesson' | 'life';
export type PostStatus = 'draft' | 'scheduled' | 'published';

export type PostListItem = {
  id: string;
  kind: PostKind;
  slug: string;
  title: string;
  subject_id: string | null;
  status: PostStatus;
  has_unpublished_changes: boolean;
  scheduled_at: string | null;
  published_at: string | null;
  updated_at: string;
};

export type Dashboard = {
  counts: ReturnType<typeof countPosts>;
  recent: PostListItem[];
  activity: ActivityEvent[];
};

export type PostFilters = {
  q?: string;
  kind?: PostKind;
  subject?: string;
  status?: PostStatus | 'changes';
};

const ALLOWED = {
  kind: ['lesson', 'life'],
  status: ['draft', 'scheduled', 'published', 'changes'],
} as const;

/** Filters from a query string. A bad value in the address bar just means "no filter". */
export function postFilters(query: Record<string, unknown>): PostFilters {
  const f: PostFilters = {};
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '';
  if (q) f.q = q;
  for (const key of ['kind', 'status'] as const) {
    const v = query[key];
    if (typeof v === 'string' && (ALLOWED[key] as readonly string[]).includes(v))
      (f as Record<string, string>)[key] = v;
  }
  // Any subject's id; one that doesn't exist just matches nothing.
  if (typeof query.subject === 'string' && SUBJECT_ID.test(query.subject)) f.subject = query.subject;
  return f;
}

/**
 * An ILIKE pattern for the search box. Characters that mean something in a PostgREST
 * `or=(…)` filter, or are wildcards, become spaces, so input can only ever be text.
 */
export function searchPattern(q: string): string | null {
  const text = q
    .replace(/[,()%*\\"_:.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return text ? `%${text}%` : null;
}

export function postStatus(p: { status: PostStatus; has_unpublished_changes: boolean }): string {
  if (p.status === 'published') return p.has_unpublished_changes ? 'Unpublished changes' : 'Published';
  return p.status === 'scheduled' ? 'Scheduled' : 'Draft';
}

export function countPosts(rows: readonly { kind: PostKind; status: PostStatus }[]) {
  const counts = { published: 0, drafts: 0, scheduled: 0, life: 0 };
  for (const r of rows) {
    if (r.status === 'published') counts.published++;
    else if (r.status === 'scheduled') counts.scheduled++;
    else counts.drafts++;
    if (r.kind === 'life') counts.life++;
  }
  return counts;
}
