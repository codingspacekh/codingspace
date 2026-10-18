import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { PostError } from './posts';

/**
 * Questions on lessons for the admin (v1.1): the inbox, approving, answering, hiding and
 * deleting. Each change is an audited admin_* function and rebuilds the lesson's page.
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
  lesson: { slug: string; title: string; live: boolean } | null;
};

function refused(error: { code?: string; message: string }, what: string): never {
  const status = { PT404: 404, PT422: 422, '22P02': 400 }[error.code ?? ''];
  if (status) throw new PostError(status as PostError['status'], error.message);
  if (error.code === '42501') throw new PostError(404, 'not allowed');
  throw new Error(`${what}: ${error.message}`);
}

const uuid = z.uuid();

/** Newest first; at most 200 of a status. */
export async function listQuestions(supabase: SupabaseClient, status: unknown): Promise<AdminQuestion[]> {
  const s = z.enum(QUESTION_STATUSES).catch('pending').parse(status);
  const { data, error } = await supabase
    .from('questions')
    .select('id, name, body, answer, status, created_at, posts(slug, title, status)')
    .eq('status', s)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) refused(error, 'questions');
  return (
    data as unknown as (Omit<AdminQuestion, 'lesson'> & {
      posts: { slug: string; title: string; status: string } | null;
    })[]
  ).map(({ posts, ...q }) => ({
    ...q,
    lesson: posts ? { slug: posts.slug, title: posts.title, live: posts.status === 'published' } : null,
  }));
}

export const questionInput = z.object({
  status: z.enum(QUESTION_STATUSES),
  answer: z.string().trim().max(4000).default(''),
});

export async function saveQuestion(supabase: SupabaseClient, id: string, input: unknown) {
  const out = questionInput.safeParse(input);
  if (!out.success) throw new PostError(422, z.prettifyError(out.error));
  const { data, error } = await supabase.rpc('admin_save_question', { p_id: uuid.parse(id), p: out.data });
  if (error) refused(error, 'admin_save_question');
  return { paths: data ? [`/posts/${data as string}`] : [] };
}

export async function deleteQuestion(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.rpc('admin_delete_question', { p_id: uuid.parse(id) });
  if (error) refused(error, 'admin_delete_question');
  return { paths: data ? [`/posts/${data as string}`] : [] };
}
