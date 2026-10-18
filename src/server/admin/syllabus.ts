import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { postSlug } from '@/lib/post-rules';
import { SUBJECT_ID } from '@/lib/subjects';
import { PostError } from './posts';

/**
 * Syllabus tags for the admin API (v1.1): the syllabuses the owner teaches, their points, and
 * which points each lesson covers. Each change is one audited admin_* database function
 * (owner-only through RLS) and returns the public pages to rebuild.
 */

type DbError = { code?: string; message: string };

function refused(error: DbError, what: string): never {
  const status = { PT404: 404, PT409: 409, PT422: 422, '23503': 422, '23505': 409, '23514': 422, '22P02': 400 }[
    error.code ?? ''
  ];
  if (status) throw new PostError(status as PostError['status'], error.message);
  if (error.code === '42501') throw new PostError(404, 'not allowed');
  throw new Error(`${what}: ${error.message}`);
}

async function call(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) refused(error, fn);
  return data;
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const out = schema.safeParse(input);
  if (!out.success) throw new PostError(422, z.prettifyError(out.error));
  return out.data;
}

const uuid = z.uuid();

export const syllabusInput = z.object({
  code: z.string().trim().min(1).max(20),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(''),
  subject_id: z.string().regex(SUBJECT_ID).nullable().default(null),
});

export const pointsInput = z
  .array(
    z.object({
      id: uuid.optional(),
      code: z.string().trim().min(1, 'every point needs a code').max(20),
      title: z.string().trim().min(1, 'every point needs a title').max(160),
    }),
  )
  .max(300);

export type AdminPoint = { id: string; code: string; title: string; lessons: number };
export type AdminSyllabus = {
  id: string;
  slug: string;
  code: string;
  title: string;
  description: string;
  subject_id: string | null;
  points: AdminPoint[];
};

export async function listSyllabuses(supabase: SupabaseClient): Promise<AdminSyllabus[]> {
  const [syllabuses, points, tags] = await Promise.all([
    supabase.from('syllabuses').select('id, slug, code, title, description, subject_id').order('sort').order('title'),
    supabase.from('syllabus_points').select('id, syllabus_id, code, title').order('sort'),
    supabase.from('post_syllabus').select('point_id'),
  ]);
  for (const r of [syllabuses, points, tags]) if (r.error) refused(r.error, 'syllabuses');
  const count = new Map<string, number>();
  for (const t of tags.data as { point_id: string }[]) count.set(t.point_id, (count.get(t.point_id) ?? 0) + 1);
  const rows = points.data as (Omit<AdminPoint, 'lessons'> & { syllabus_id: string })[];
  return (syllabuses.data as Omit<AdminSyllabus, 'points'>[]).map((s) => ({
    ...s,
    points: rows
      .filter((p) => p.syllabus_id === s.id)
      .map((p) => ({ id: p.id, code: p.code, title: p.title, lessons: count.get(p.id) ?? 0 })),
  }));
}

/** The syllabus list and page, and every published lesson tagged with one of its points. */
async function syllabusPages(supabase: SupabaseClient, id: string): Promise<string[]> {
  const [syllabus, lessons] = await Promise.all([
    supabase.from('syllabuses').select('slug').eq('id', id).maybeSingle(),
    supabase.from('public_syllabus_lessons').select('slug').eq('syllabus_id', id),
  ]);
  if (syllabus.error) refused(syllabus.error, 'syllabuses');
  if (lessons.error) refused(lessons.error, 'public_syllabus_lessons');
  const own = syllabus.data ? [`/syllabus/${(syllabus.data as { slug: string }).slug}`] : [];
  return ['/syllabus', ...own, ...(lessons.data as { slug: string }[]).map((l) => `/posts/${l.slug}`)];
}

const merge = (...lists: string[][]) => [...new Set(lists.flat())];

/** Adds (id null) or edits a syllabus. A new one gets its address from its code: /syllabus/9618. */
export async function saveSyllabus(supabase: SupabaseClient, id: string | null, input: unknown) {
  const p = parse(syllabusInput, input);
  if (id !== null) {
    await call(supabase, 'admin_save_syllabus', { p_id: uuid.parse(id), p });
    return { id, paths: await syllabusPages(supabase, id) };
  }
  const base = postSlug(p.code, postSlug(p.title, 'syllabus'));
  for (let n = 1; n <= 20; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const { data, error } = await supabase.rpc('admin_save_syllabus', { p_id: null, p: { ...p, slug } });
    if (!error) return { id: data as string, paths: ['/syllabus', `/syllabus/${slug}`] };
    if (error.code !== '23505') refused(error, 'admin_save_syllabus');
  }
  throw new PostError(409, 'could not find a free address for this syllabus');
}

/** Replaces a syllabus's points (kept ones keep their tags). */
export async function saveSyllabusPoints(supabase: SupabaseClient, id: string, input: unknown) {
  const points = parse(pointsInput, input);
  const before = await syllabusPages(supabase, uuid.parse(id));
  await call(supabase, 'admin_save_syllabus_points', { p_syllabus: id, p: points });
  return { paths: merge(before, await syllabusPages(supabase, id)) };
}

export async function deleteSyllabus(supabase: SupabaseClient, id: string) {
  const paths = await syllabusPages(supabase, uuid.parse(id));
  await call(supabase, 'admin_delete_syllabus', { p_id: id });
  return { paths };
}

export async function reorderSyllabuses(supabase: SupabaseClient, input: unknown) {
  const { ids } = parse(z.object({ ids: z.array(uuid).max(100) }), input);
  await call(supabase, 'admin_reorder_syllabuses', { p_ids: ids });
  return { paths: ['/syllabus'] };
}

// ── A lesson's points (the editor) ─────────────────────────────────────────

/** The syllabuses to choose from, and the points this lesson has. */
export async function getPostSyllabus(supabase: SupabaseClient, postId: string) {
  const [syllabuses, tags] = await Promise.all([
    listSyllabuses(supabase),
    supabase.from('post_syllabus').select('point_id').eq('post_id', uuid.parse(postId)),
  ]);
  if (tags.error) refused(tags.error, 'post_syllabus');
  return {
    syllabuses: syllabuses.map(({ id, code, title, points }) => ({
      id,
      code,
      title,
      points: points.map(({ id: pid, code: c, title: t }) => ({ id: pid, code: c, title: t })),
    })),
    point_ids: (tags.data as { point_id: string }[]).map((t) => t.point_id),
  };
}

/** The syllabus pages a lesson's points are on (old and new), and the lesson's own page if live. */
async function postPages(supabase: SupabaseClient, postId: string, pointIds: string[]): Promise<string[]> {
  const [post, syllabuses] = await Promise.all([
    supabase.from('public_posts').select('slug').eq('id', postId).maybeSingle(),
    pointIds.length
      ? supabase.from('syllabus_points').select('syllabuses(slug)').in('id', pointIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (post.error) refused(post.error, 'public_posts');
  if (syllabuses.error) refused(syllabuses.error, 'syllabus_points');
  if (!post.data) return []; // a draft: nothing public changes
  const slugs = (syllabuses.data as unknown as { syllabuses: { slug: string } | null }[]).flatMap((r) =>
    r.syllabuses ? [`/syllabus/${r.syllabuses.slug}`] : [],
  );
  return merge([`/posts/${(post.data as { slug: string }).slug}`], slugs);
}

export async function setPostSyllabus(supabase: SupabaseClient, postId: string, input: unknown) {
  const { point_ids } = parse(z.object({ point_ids: z.array(uuid).max(30) }), input);
  const id = uuid.parse(postId);
  const { data: before, error } = await supabase.from('post_syllabus').select('point_id').eq('post_id', id);
  if (error) refused(error, 'post_syllabus');
  await call(supabase, 'admin_set_post_syllabus', { p_post: id, p_points: point_ids });
  const old = (before as { point_id: string }[]).map((t) => t.point_id);
  return { paths: await postPages(supabase, id, [...new Set([...old, ...point_ids])]) };
}
