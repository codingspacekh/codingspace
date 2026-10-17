import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { postSlug } from '@/lib/post-rules';
import { EMAIL, landingUrlProblem } from '@/lib/site-rules';
import type { SubjectId } from '@/lib/subjects';
import { renderSnippet } from '@/server/render/snippet';
import { PostError } from './posts';

/**
 * Site content for the admin API (03 ADM-11, ADM-13, ADM-14): projects, the author profile and
 * timeline, and the problem of the week. Each change is one admin_* database function (audited,
 * owner-only through RLS) and returns the public pages to rebuild.
 */

type DbError = { code?: string; message: string };

function refused(error: DbError, what: string): never {
  const status = { PT404: 404, PT409: 409, PT422: 422, '23505': 409, '23514': 422, '22P02': 400, '22007': 422 }[
    error.code ?? ''
  ];
  if (status) throw new PostError(status as PostError['status'], error.message);
  if (error.code === '42501') throw new PostError(404, 'not allowed');
  throw new Error(`${what}: ${error.message}`);
}

async function call<T>(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) refused(error, fn);
  return data as T;
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const out = schema.safeParse(input);
  if (!out.success) throw new PostError(422, z.prettifyError(out.error));
  return out.data;
}

const uuid = z.uuid();
const subject = z.enum(['math', 'physics', 'coding', 'it']);

// ── Projects (ADM-13) ───────────────────────────────────────────────────────

export const PROJECT_PAGES = ['/', '/projects'];

export const projectInput = z.object({
  name: z.string().trim().min(1).max(80),
  glyph: z.string().trim().max(4).default(''),
  subject_id: subject.nullable().default(null),
  tag: z.string().trim().max(40).default(''),
  description: z.string().trim().min(1).max(500),
  platforms: z.array(z.string().trim().max(30)).max(8).default([]),
  landing_url: z
    .string()
    .trim()
    .superRefine((v, ctx) => {
      const problem = landingUrlProblem(v);
      if (problem) ctx.addIssue({ code: 'custom', message: problem });
    }),
});

export type AdminProject = {
  id: string;
  slug: string;
  name: string;
  glyph: string;
  subject_id: SubjectId | null;
  tag: string;
  description: string;
  platforms: string[];
  landing_url: string;
  is_featured: boolean;
  sort: number;
};

export async function listProjects(supabase: SupabaseClient): Promise<AdminProject[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, slug, name, glyph, subject_id, tag, description, platforms, landing_url, is_featured, sort')
    .order('sort')
    .order('name');
  if (error) refused(error, 'projects');
  return data as AdminProject[];
}

/** Adds (id null) or edits a project. A new one gets a slug from its name: -2, -3… if taken. */
export async function saveProject(supabase: SupabaseClient, id: string | null, input: unknown) {
  const p = parse(projectInput, input);
  if (id !== null) {
    await call(supabase, 'admin_save_project', { p_id: uuid.parse(id), p });
    return { id, paths: PROJECT_PAGES };
  }
  const base = postSlug(p.name, 'project');
  for (let n = 1; n <= 20; n++) {
    const slug = n === 1 && base !== 'project' ? base : `${base}-${n}`;
    const { data, error } = await supabase.rpc('admin_save_project', { p_id: null, p: { ...p, slug } });
    if (!error) return { id: data as string, paths: PROJECT_PAGES };
    if (error.code !== '23505') refused(error, 'admin_save_project');
  }
  throw new PostError(409, 'could not find a free address for this project');
}

export async function featureProject(supabase: SupabaseClient, id: unknown) {
  await call(supabase, 'admin_feature_project', { p_id: id === null ? null : uuid.parse(id) });
  return { paths: PROJECT_PAGES };
}

export async function deleteProject(supabase: SupabaseClient, id: string) {
  await call(supabase, 'admin_delete_project', { p_id: uuid.parse(id) });
  return { paths: PROJECT_PAGES };
}

export async function reorderProjects(supabase: SupabaseClient, input: unknown) {
  const { ids } = parse(z.object({ ids: z.array(uuid).max(200) }), input);
  await call(supabase, 'admin_reorder_projects', { p_ids: ids });
  return { paths: PROJECT_PAGES };
}

// ── Author profile and timeline (ADM-14) ────────────────────────────────────

export const AUTHOR_PAGES = ['/author'];

const count = z.number().int().min(0).max(1_000_000).nullable().default(null);

export const authorInput = z.object({
  profile: z.object({
    name: z.string().trim().min(1).max(80),
    bio: z.string().trim().max(2000).default(''),
    years: count.refine((v) => v === null || v <= 100, 'at most 100 years'),
    students: count,
    email: z
      .string()
      .trim()
      .max(200)
      .refine((v) => v === '' || EMAIL.test(v), 'not an email address')
      .default(''),
    /** An image from the media library, shown on the Author page instead of the initials. */
    photo_media_id: uuid.nullable().default(null),
  }),
  timeline: z
    .array(z.object({ year: z.number().int().min(1900).max(2200), text: z.string().trim().min(1).max(300) }))
    .max(50),
});
export type AuthorInput = z.input<typeof authorInput>;

export type AuthorPhoto = { id: string; widths: number[] };

export async function getAuthor(supabase: SupabaseClient) {
  const [profile, timeline] = await Promise.all([
    supabase.from('profile').select('name, bio, years, students, email, photo_media_id, photo_widths').maybeSingle(),
    supabase.from('timeline_items').select('year, text').order('sort'),
  ]);
  if (profile.error) refused(profile.error, 'profile');
  if (timeline.error) refused(timeline.error, 'timeline');
  const { photo_widths, ...p } = profile.data ?? {
    name: '',
    bio: '',
    years: null,
    students: null,
    email: null,
    photo_media_id: null,
    photo_widths: [],
  };
  return {
    profile: { ...p, email: p.email ?? '' } as z.infer<typeof authorInput>['profile'],
    /** For the preview in the admin. */
    photo: (p.photo_media_id ? { id: p.photo_media_id, widths: photo_widths } : null) as AuthorPhoto | null,
    timeline: timeline.data as { year: number; text: string }[],
  };
}

/** Saves the profile and the whole timeline (in the order given). */
export async function saveAuthor(supabase: SupabaseClient, input: unknown) {
  const { profile, timeline } = parse(authorInput, input);
  await call(supabase, 'admin_save_profile', { p: profile });
  await call(supabase, 'admin_save_timeline', { p_items: timeline });
  return { paths: AUTHOR_PAGES };
}

// ── Problem of the week (ADM-11) ────────────────────────────────────────────

/** Home shows the newest current problem; each subject page shows its own. */
const problemPages = (subjects: string[]) => ['/', ...subjects.map((s) => `/study/${s}`)];

export const problemInput = z.object({
  subject_id: subject,
  section_id: uuid.nullable().default(null),
  week_of: z.iso.date(),
  statement: z.string().trim().min(1).max(4000),
  hint: z.string().trim().max(4000).default(''),
  solution: z.string().trim().max(4000).default(''),
});

export type AdminProblem = {
  id: string;
  subject_id: SubjectId;
  section_id: string | null;
  week_of: string;
  statement: string;
  hint: string;
  solution: string;
  is_current: boolean;
  updated_at: string;
};

/** Every problem, newest week first (past ones too: they can be shown again). */
export async function listProblems(supabase: SupabaseClient): Promise<AdminProblem[]> {
  const { data, error } = await supabase
    .from('featured_problems')
    .select('id, subject_id, section_id, week_of, statement, hint, solution, is_current, updated_at')
    .order('week_of', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) refused(error, 'featured_problems');
  return data as AdminProblem[];
}

export async function saveProblem(supabase: SupabaseClient, id: string | null, input: unknown) {
  const p = parse(problemInput, input);
  const out = await call<{ id: string; subjects: string[] }>(supabase, 'admin_save_problem', {
    p_id: id === null ? null : uuid.parse(id),
    p,
  });
  return { id: out.id, paths: problemPages(out.subjects) };
}

export async function setCurrentProblem(supabase: SupabaseClient, id: string, input: unknown) {
  const { current } = parse(z.object({ current: z.boolean() }), input);
  const out = await call<{ subjects: string[] }>(supabase, 'admin_set_current_problem', {
    p_id: uuid.parse(id),
    p_current: current,
  });
  return { paths: problemPages(out.subjects) };
}

export async function deleteProblem(supabase: SupabaseClient, id: string) {
  const out = await call<{ subjects: string[]; was_current: boolean }>(supabase, 'admin_delete_problem', {
    p_id: uuid.parse(id),
  });
  // A hidden problem was on no page.
  return { paths: out.was_current ? problemPages(out.subjects) : [] };
}

export const previewInput = z.object({
  statement: z.string().max(4000).default(''),
  hint: z.string().max(4000).default(''),
  solution: z.string().max(4000).default(''),
});

/** The live preview (03 ADM-11): exactly what students will see, from the same renderer. */
export async function previewProblem(input: unknown) {
  const p = parse(previewInput, input);
  const [statement, hint, solution] = await Promise.all([
    renderSnippet(p.statement),
    renderSnippet(p.hint),
    renderSnippet(p.solution),
  ]);
  return { statement: statement.html, hint: hint.html, solution: solution.html };
}
