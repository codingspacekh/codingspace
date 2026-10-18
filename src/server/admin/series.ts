import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { postSlug } from '@/lib/post-rules';
import type { SubjectId } from '@/lib/subjects';
import { PostError } from './posts';

/**
 * Lesson series for the admin API (v1.1, FR-03): named, ordered lists of lessons from any
 * subject. Each change is one audited admin_* database function (owner-only through RLS) and
 * returns the public pages to rebuild: the series list, the series' page and every lesson
 * that was or is in it ("Part n of N", previous/next).
 */

type DbError = { code?: string; message: string };

function refused(error: DbError, what: string): never {
  const status = { PT404: 404, PT422: 422, '23505': 409, '22P02': 400 }[error.code ?? ''];
  if (status) throw new PostError(status as PostError['status'], error.message);
  if (error.code === '42501') throw new PostError(404, 'not allowed');
  throw new Error(`${what}: ${error.message}`);
}

async function call<T>(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) refused(error, fn);
  return data as T;
}

const uuid = z.uuid();

export const seriesInput = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(''),
  post_ids: z.array(uuid).max(100),
});

export type AdminSeries = {
  id: string;
  slug: string;
  title: string;
  description: string;
  sort: number;
  post_ids: string[];
};

/** A lesson the owner can put in a series; drafts too (they show once published). */
export type SeriesLessonChoice = {
  id: string;
  slug: string;
  title: string;
  subject_id: SubjectId | null;
  status: 'draft' | 'scheduled' | 'published';
};

export async function listSeries(supabase: SupabaseClient): Promise<AdminSeries[]> {
  const [series, items] = await Promise.all([
    supabase.from('series').select('id, slug, title, description, sort').order('sort').order('title'),
    supabase.from('series_lessons').select('series_id, post_id, position').order('position'),
  ]);
  if (series.error) refused(series.error, 'series');
  if (items.error) refused(items.error, 'series_lessons');
  return (series.data as Omit<AdminSeries, 'post_ids'>[]).map((s) => ({
    ...s,
    post_ids: (items.data as { series_id: string; post_id: string }[])
      .filter((i) => i.series_id === s.id)
      .map((i) => i.post_id),
  }));
}

export async function listLessonChoices(supabase: SupabaseClient): Promise<SeriesLessonChoice[]> {
  const { data, error } = await supabase
    .from('posts')
    .select('id, slug, title, subject_id, status')
    .eq('kind', 'lesson')
    .order('subject_id')
    .order('title');
  if (error) refused(error, 'posts');
  return data as SeriesLessonChoice[];
}

/** The pages showing a series now: the list, its page and its lessons. */
async function seriesPaths(supabase: SupabaseClient, id: string): Promise<string[]> {
  const [series, lessons] = await Promise.all([
    supabase.from('series').select('slug').eq('id', id).maybeSingle(),
    supabase.from('series_lessons').select('posts(slug, status)').eq('series_id', id),
  ]);
  if (series.error) refused(series.error, 'series');
  if (lessons.error) refused(lessons.error, 'series_lessons');
  // Drafts have no public page yet.
  const slugs = (lessons.data as unknown as { posts: { slug: string; status: string } | null }[]).flatMap((l) =>
    l.posts?.status === 'published' ? [`/posts/${l.posts.slug}`] : [],
  );
  return ['/series', ...(series.data ? [`/series/${series.data.slug}`] : []), ...slugs];
}

const merge = (...lists: string[][]) => [...new Set(lists.flat())];

/** Adds (id null) or edits a series. A new one gets a slug from its title: -2, -3… if taken. */
export async function saveSeries(supabase: SupabaseClient, id: string | null, input: unknown) {
  const out = seriesInput.safeParse(input);
  if (!out.success) throw new PostError(422, z.prettifyError(out.error));
  const p = out.data;
  if (id !== null) {
    const before = await seriesPaths(supabase, uuid.parse(id));
    await call(supabase, 'admin_save_series', { p_id: id, p });
    return { id, paths: merge(before, await seriesPaths(supabase, id)) };
  }
  const base = postSlug(p.title, 'series');
  for (let n = 1; n <= 20; n++) {
    const slug = n === 1 && base !== 'series' ? base : `${base}-${n}`;
    const { data, error } = await supabase.rpc('admin_save_series', { p_id: null, p: { ...p, slug } });
    if (!error) return { id: data as string, paths: await seriesPaths(supabase, data as string) };
    if (error.code !== '23505') refused(error, 'admin_save_series');
  }
  throw new PostError(409, 'could not find a free address for this series');
}

export async function deleteSeries(supabase: SupabaseClient, id: string) {
  const before = await seriesPaths(supabase, uuid.parse(id));
  await call(supabase, 'admin_delete_series', { p_id: id });
  return { paths: before };
}

export async function reorderSeries(supabase: SupabaseClient, input: unknown) {
  const out = z.object({ ids: z.array(uuid).max(200) }).safeParse(input);
  if (!out.success) throw new PostError(422, z.prettifyError(out.error));
  await call(supabase, 'admin_reorder_series', { p_ids: out.data.ids });
  return { paths: ['/series'] };
}
