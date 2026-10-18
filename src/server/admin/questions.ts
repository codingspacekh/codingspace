import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ApiError, dbError } from './errors';
import { SLUG } from '@/lib/slug';

/**
 * Questions on lessons and comments on life posts for the admin (v1.1): the inbox, approving,
 * answering, hiding and deleting. Each change is an audited admin_* function and rebuilds the
 * post's page.
 */

export const QUESTION_STATUSES = ['pending', 'published', 'hidden'] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export type AdminQuestion = {
  id: string;
  name: string;
  body: string;
  answer: string;
  status: QuestionStatus;
  created_at: string;
  /** The post it was written under: a lesson (a question) or a life post (a comment). */
  lesson: { slug: string; title: string; live: boolean; kind: 'lesson' | 'life' } | null;
};

const uuid = z.uuid();

/** How many the inbox loads at a time ("Load more" for the rest). */
export const INBOX_PAGE = 50;

export type QuestionInbox = {
  questions: AdminQuestion[];
  /** How many there are on each tab (for one post when filtered). */
  counts: Record<QuestionStatus, number>;
  /** How many older ones of this tab are left beyond `questions`. */
  more: number;
};

const inboxQuery = z.object({
  status: z.enum(QUESTION_STATUSES).catch('pending'),
  /** Only the ones written before this (the last one shown): "Load more". */
  before: z.iso.datetime({ offset: true }).optional().catch(undefined),
  /** Only the ones under this post (its slug). */
  post: z.string().regex(SLUG).optional().catch(undefined),
  /** How many to load: a page, or more to reload what is already shown after a change. */
  limit: z.coerce.number().int().min(1).max(500).catch(INBOX_PAGE),
});

const QUESTION_COLUMNS = 'id, name, body, answer, status, created_at';

/** The inbox: one tab, newest first, a page at a time; optionally for one post. */
export async function listQuestions(supabase: SupabaseClient, query: unknown): Promise<QuestionInbox> {
  const q = inboxQuery.parse(query && typeof query === 'object' ? query : {});
  // Filtering by post needs an inner join; otherwise questions on deleted posts still show.
  const posts = q.post ? 'posts!inner(slug, title, status, kind)' : 'posts(slug, title, status, kind)';
  let list = supabase
    .from('questions')
    .select(`${QUESTION_COLUMNS}, ${posts}`, { count: 'exact' })
    .eq('status', q.status);
  if (q.post) list = list.eq('posts.slug', q.post);
  if (q.before) list = list.lt('created_at', q.before);
  const count = (status: QuestionStatus) => {
    const c = supabase
      .from('questions')
      .select(q.post ? 'id, posts!inner(slug)' : 'id', { count: 'exact', head: true })
      .eq('status', status);
    return q.post ? c.eq('posts.slug', q.post) : c;
  };

  const [rows, ...counts] = await Promise.all([
    list.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(q.limit),
    ...QUESTION_STATUSES.map(count),
  ]);
  if (rows.error) dbError(rows.error, 'questions');
  for (const c of counts) if (c.error) dbError(c.error, 'questions');

  const questions = (
    rows.data as unknown as (Omit<AdminQuestion, 'lesson'> & {
      posts: { slug: string; title: string; status: string; kind: 'lesson' | 'life' } | null;
    })[]
  ).map(({ posts, ...item }) => ({
    ...item,
    lesson: posts
      ? { slug: posts.slug, title: posts.title, live: posts.status === 'published', kind: posts.kind }
      : null,
  }));
  return {
    questions,
    counts: Object.fromEntries(QUESTION_STATUSES.map((status, i) => [status, counts[i]!.count ?? 0])) as Record<
      QuestionStatus,
      number
    >,
    more: Math.max(0, (rows.count ?? questions.length) - questions.length),
  };
}

export const questionInput = z.object({
  status: z.enum(QUESTION_STATUSES),
  answer: z.string().trim().max(4000).default(''),
});

export async function saveQuestion(supabase: SupabaseClient, id: string, input: unknown) {
  const out = questionInput.safeParse(input);
  if (!out.success) throw new ApiError(422, z.prettifyError(out.error));
  const { data, error } = await supabase.rpc('admin_save_question', { p_id: uuid.parse(id), p: out.data });
  if (error) dbError(error, 'admin_save_question');
  return { paths: data ? [`/posts/${data as string}`] : [] };
}

export async function deleteQuestion(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.rpc('admin_delete_question', { p_id: uuid.parse(id) });
  if (error) dbError(error, 'admin_delete_question');
  return { paths: data ? [`/posts/${data as string}`] : [] };
}
