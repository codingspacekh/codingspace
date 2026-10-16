import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { postSlug, revalidationPaths, scheduleProblem, type PublishedRef } from '@/lib/post-rules';
import { renderContent } from '@/server/render';

/**
 * Post changes for the admin API (03 ADM-03, ADM-05…09). Each call is one admin_* database
 * function, so the change, its revision and its audit row commit together or not at all.
 * The client passed in decides who is acting: the owner's session, or the service role (cron).
 */

/** A refused change. `status` is the HTTP status for the API (PostgREST PTxxx codes map 1:1). */
export class PostError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 422,
    message: string,
  ) {
    super(message);
  }
}

type DbError = { code?: string; message: string };

function fail(error: DbError, what: string): never {
  const status = { PT404: 404, PT409: 409, PT422: 422, '23505': 409, '23514': 422, '22P02': 400 }[error.code ?? ''];
  if (status) throw new PostError(status as PostError['status'], error.message);
  throw new Error(`${what}: ${error.message}`);
}

async function call<T>(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) fail(error, fn);
  return data as T;
}

const uuid = z.uuid();
const SUBJECTS = ['math', 'physics', 'coding', 'it'] as const;

/** What the editor may save (03 ADM-04/05). The database checks the same limits again. */
export const draftFields = z
  .object({
    title: z.string().max(200),
    summary: z.string().max(500),
    content_json: z.object({ type: z.literal('doc'), content: z.array(z.unknown()) }).loose(),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      .max(80),
    subject_id: z.enum(SUBJECTS).nullable(),
    section_id: uuid.nullable(),
    level: z.number().int().min(1).max(3),
    minutes: z.number().int().min(1).max(600),
    problem_count: z.number().int().min(0).max(500),
    lang: z.enum(['en', 'km']),
  })
  .partial()
  .strict();
export type DraftFields = z.infer<typeof draftFields>;

export const newPost = z.object({
  kind: z.enum(['lesson', 'life']),
  title: z.string().max(200).default(''),
  subject_id: z.enum(SUBJECTS).nullable().default(null),
  section_id: uuid.nullable().default(null),
  lang: z.enum(['en', 'km']).default('en'),
});

/** Creates a draft with a slug from its title; adds -2, -3… if the slug is taken. */
export async function createPost(supabase: SupabaseClient, input: z.input<typeof newPost>, now = new Date()) {
  const p = newPost.parse(input);
  if (p.kind === 'lesson' && !p.subject_id) throw new PostError(422, 'a lesson needs a subject');
  const base = postSlug(p.title, `${p.kind}-${now.toISOString().slice(0, 10)}`);
  for (let n = 1; n <= 20; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const { data, error } = await supabase.rpc('admin_create_post', {
      p_kind: p.kind,
      p_title: p.title,
      p_slug: slug,
      p_subject_id: p.kind === 'life' ? null : p.subject_id,
      p_section_id: p.kind === 'life' ? null : p.section_id,
      p_lang: p.lang,
    });
    if (!error) return { id: data as string, slug };
    if (error.code !== '23505') fail(error, 'admin_create_post');
  }
  throw new PostError(409, 'could not find a free URL for this title');
}

/** Autosave. Returns the new revision; 409 if another tab saved first. */
export async function savePost(supabase: SupabaseClient, id: string, revision: number, fields: unknown) {
  const parsed = draftFields.safeParse(fields);
  if (!parsed.success) throw new PostError(422, z.prettifyError(parsed.error));
  return call<number>(supabase, 'admin_save_post', {
    p_id: uuid.parse(id),
    p_revision: revision,
    p_fields: parsed.data,
  });
}

export type Published = PublishedRef & { was_published: boolean; published_at: string; paths: string[] };

/**
 * Publish or Update: renders the draft as it is at `revision` (03 §6.3) and swaps it in as
 * the live snapshot. Returns the pages to revalidate.
 */
export async function publishPost(supabase: SupabaseClient, id: string, revision: number): Promise<Published> {
  const { data: draft, error } = await supabase
    .from('posts')
    .select('content_json, lang, revision')
    .eq('id', uuid.parse(id))
    .maybeSingle();
  if (error) fail(error, 'posts');
  if (!draft) throw new PostError(404, 'post not found');
  // Renders only what the caller has seen; the function re-checks under a row lock.
  if (draft.revision !== revision) throw new PostError(409, `the post changed since revision ${revision}`);

  const out = await renderContent(draft.content_json, { lang: draft.lang });
  const result = await call<Omit<Published, 'paths'>>(supabase, 'admin_publish_post', {
    p_id: id,
    p_revision: revision,
    p_render: {
      html: out.html,
      toc: out.toc,
      search_text: out.searchText,
      has_math: out.hasMath,
      has_code: out.hasCode,
    },
  });
  return { ...result, paths: revalidationPaths(result) };
}

export async function unpublishPost(supabase: SupabaseClient, id: string) {
  const result = await call<PublishedRef>(supabase, 'admin_unpublish_post', { p_id: uuid.parse(id) });
  return { ...result, paths: revalidationPaths(result) };
}

export async function schedulePost(supabase: SupabaseClient, id: string, revision: number, at: Date, now = new Date()) {
  const problem = scheduleProblem(at, now);
  if (problem) throw new PostError(422, `schedule time: ${problem}`);
  await call(supabase, 'admin_schedule_post', { p_id: uuid.parse(id), p_revision: revision, p_at: at.toISOString() });
}

export async function unschedulePost(supabase: SupabaseClient, id: string) {
  await call(supabase, 'admin_unschedule_post', { p_id: uuid.parse(id) });
}

export async function restoreRevision(supabase: SupabaseClient, id: string, revision: number, revisionId: number) {
  return call<number>(supabase, 'admin_restore_revision', {
    p_id: uuid.parse(id),
    p_revision: revision,
    p_revision_id: revisionId,
  });
}

export async function deletePost(supabase: SupabaseClient, id: string) {
  const result = await call<PublishedRef & { was_published: boolean }>(supabase, 'admin_delete_post', {
    p_id: uuid.parse(id),
  });
  return { ...result, paths: result.was_published ? revalidationPaths(result) : [] };
}

/**
 * The scheduled-publish cron (03 §6.1): publishes every post whose time has come. Needs the
 * service-role client. One failure doesn't stop the rest; it is reported.
 */
export async function publishDuePosts(service: SupabaseClient, now = new Date()) {
  const { data, error } = await service
    .from('posts')
    .select('id, revision')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now.toISOString())
    .order('scheduled_at');
  if (error) fail(error, 'due posts');
  const published: Published[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const post of data ?? []) {
    try {
      published.push(await publishPost(service, post.id, post.revision));
    } catch (e) {
      failed.push({ id: post.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { published, failed };
}
