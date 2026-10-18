import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { SUBJECT_COLORS, SUBJECT_ID, subjectAddress, type Subject } from '@/lib/subjects';
import { PostError } from './posts';

/**
 * Subjects for the admin API (v1.1): add, edit, show/hide, reorder and delete. Each change is
 * one audited admin_* database function (owner-only through RLS). Every public page lists the
 * subjects in its menus, so a change visitors can see rebuilds every public page.
 */

type DbError = { code?: string; message: string };

function refused(error: DbError, what: string): never {
  const status = { PT404: 404, PT409: 409, PT422: 422, '23505': 409, '23514': 422, '22P02': 400 }[error.code ?? ''];
  if (status) throw new PostError(status as PostError['status'], error.message);
  if (error.code === '42501') throw new PostError(404, 'not allowed');
  throw new Error(`${what}: ${error.message}`);
}

/** Checks a subject id from a request (a section's, a post's…); the database checks it exists. */
export const subjectId = z.string().regex(SUBJECT_ID);

export const subjectInput = z.object({
  /** The address (/study/<id>), new subjects only: made from the name when left out. */
  id: subjectId.optional(),
  name: z.string().trim().min(1).max(40),
  glyph: z.string().trim().max(4).default(''),
  color: z.enum(SUBJECT_COLORS),
  blurb: z.string().trim().max(200).default(''),
  intro: z.string().trim().max(600).default(''),
  visible: z.boolean(),
});

export type AdminSubject = Subject & { visible: boolean; sections: number; lessons: number };

/** Every subject, hidden ones too, in site order (the admin shell shares these with each page). */
export async function listSubjects(supabase: SupabaseClient): Promise<(Subject & { visible: boolean })[]> {
  const { data, error } = await supabase
    .from('subjects')
    .select('id, name, glyph, color, blurb, intro, visible')
    .order('sort')
    .order('id');
  if (error) refused(error, 'subjects');
  return data as (Subject & { visible: boolean })[];
}

/** The subjects with how many sections and lessons (drafts too) each has: only an empty one can be deleted. */
export async function listSubjectsWithCounts(supabase: SupabaseClient): Promise<AdminSubject[]> {
  const [subjects, sections, lessons] = await Promise.all([
    listSubjects(supabase),
    supabase.from('sections').select('subject_id'),
    supabase.from('posts').select('subject_id').eq('kind', 'lesson'),
  ]);
  if (sections.error) refused(sections.error, 'sections');
  if (lessons.error) refused(lessons.error, 'posts');
  const count = (rows: { subject_id: string | null }[], id: string) => rows.filter((r) => r.subject_id === id).length;
  return subjects.map((s) => ({ ...s, sections: count(sections.data, s.id), lessons: count(lessons.data, s.id) }));
}

/** Every public page: they all list the subjects in the Study menu and the footer. */
export async function everyPublicPage(supabase: SupabaseClient): Promise<string[]> {
  const [subjects, series, posts, projects, syllabuses] = await Promise.all([
    supabase.from('subjects').select('id'),
    supabase.from('series').select('slug'),
    supabase.from('public_posts').select('slug'),
    supabase.from('projects').select('slug'),
    supabase.from('syllabuses').select('slug'),
  ]);
  for (const r of [subjects, series, posts, projects, syllabuses]) if (r.error) refused(r.error, 'pages');
  return [
    '/',
    ...(subjects.data as { id: string }[]).map((s) => `/study/${s.id}`),
    '/series',
    ...(series.data as { slug: string }[]).map((s) => `/series/${s.slug}`),
    '/syllabus',
    ...(syllabuses.data as { slug: string }[]).map((s) => `/syllabus/${s.slug}`),
    '/projects',
    ...(projects.data as { slug: string }[]).map((p) => `/projects/${p.slug}`),
    '/author',
    '/saved',
    ...(posts.data as { slug: string }[]).map((p) => `/posts/${p.slug}`),
  ];
}

async function isVisible(supabase: SupabaseClient, id: string): Promise<boolean | null> {
  const { data, error } = await supabase.from('subjects').select('visible').eq('id', id).maybeSingle();
  if (error) refused(error, 'subjects');
  return data ? (data as { visible: boolean }).visible : null;
}

/** Adds (id null) or edits a subject. A hidden subject's edits change no public page. */
export async function saveSubject(supabase: SupabaseClient, id: string | null, input: unknown) {
  const out = subjectInput.safeParse(input);
  if (!out.success) throw new PostError(422, z.prettifyError(out.error));
  const p = out.data;
  if (id === null) {
    const newId = p.id ?? subjectAddress(p.name);
    if (!SUBJECT_ID.test(newId)) throw new PostError(422, 'choose an address: lowercase letters only (a-z)');
    const { data, error } = await supabase.rpc('admin_save_subject', { p_id: null, p: { ...p, id: newId } });
    if (error) {
      if (error.code === '23505') throw new PostError(409, `there is already a subject at /study/${newId}`);
      refused(error, 'admin_save_subject');
    }
    return { id: data as string, paths: p.visible ? await everyPublicPage(supabase) : [] };
  }
  const was = await isVisible(supabase, subjectId.parse(id));
  if (was === null) throw new PostError(404, 'subject not found');
  const { error } = await supabase.rpc('admin_save_subject', { p_id: id, p });
  if (error) refused(error, 'admin_save_subject');
  return { id, paths: was || p.visible ? await everyPublicPage(supabase) : [] };
}

export async function deleteSubject(supabase: SupabaseClient, id: string) {
  const was = await isVisible(supabase, subjectId.parse(id));
  if (was === null) throw new PostError(404, 'subject not found');
  // Listed before the delete: the subject's own page goes too (a 404 from now on).
  const paths = was ? await everyPublicPage(supabase) : [];
  const { error } = await supabase.rpc('admin_delete_subject', { p_id: id });
  if (error) refused(error, 'admin_delete_subject');
  return { paths };
}

export async function reorderSubjects(supabase: SupabaseClient, input: unknown) {
  const out = z.object({ ids: z.array(subjectId).max(100) }).safeParse(input);
  if (!out.success) throw new PostError(422, z.prettifyError(out.error));
  const { error } = await supabase.rpc('admin_reorder_subjects', { p_ids: out.data.ids });
  if (error) refused(error, 'admin_reorder_subjects');
  return { paths: await everyPublicPage(supabase) };
}
