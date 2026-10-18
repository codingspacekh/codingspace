import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { BUILT_IN, cleanItem, HEADER_PARTS, PHOTO_SHAPES, type AuthorItem, type AuthorSection } from '@/lib/author';
import { postSlug } from '@/lib/post-rules';
import {
  isBlank,
  PROJECT_LIMITS,
  PROJECT_TEXT,
  type ProjectDownload,
  type ProjectFaq,
  type ProjectFeature,
  type ProjectReason,
  type ProjectStep,
} from '@/lib/project-page';
import { EMAIL, landingUrlProblem, optionalUrlProblem } from '@/lib/site-rules';
import { SUBJECT_ID, type SubjectId } from '@/lib/subjects';
import { renderSnippet } from '@/server/render/snippet';
import { PostError } from './posts';

/**
 * Site content for the admin API (03 ADM-11, ADM-13, ADM-14): projects, the author profile and
 * timeline, and the problem of the week. Each change is one admin_* database function (audited,
 * owner-only through RLS) and returns the public pages to rebuild.
 */

type DbError = { code?: string; message: string };

function refused(error: DbError, what: string): never {
  const status = {
    PT404: 404,
    PT409: 409,
    PT422: 422,
    '23503': 422,
    '23505': 409,
    '23514': 422,
    '22P02': 400,
    '22007': 422,
  }[error.code ?? ''];
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
const subject = z.string().regex(SUBJECT_ID);

// ── Projects (ADM-13; v1.1: each has its own landing page) ─────────────────

export const PROJECT_PAGES = ['/', '/projects'];

const text = (max: number) => z.string().trim().max(max).default('');
const url = (optional: boolean) =>
  z
    .string()
    .trim()
    .superRefine((v, ctx) => {
      const problem = optional ? optionalUrlProblem(v) : landingUrlProblem(v);
      if (problem) ctx.addIssue({ code: 'custom', message: problem });
    });
/** A list for the page; items with every field blank are dropped first. */
const list = <T extends z.ZodRawShape>(shape: T, max: number) =>
  z.preprocess(
    (v) =>
      Array.isArray(v)
        ? v.filter(
            (i) =>
              !(
                typeof i === 'object' &&
                i !== null &&
                Object.values(i).every((x) => typeof x === 'string') &&
                isBlank(i as Record<string, string>)
              ),
          )
        : v,
    z.array(z.object(shape)).max(max).default([]),
  );
const L = PROJECT_LIMITS;
const T = PROJECT_TEXT;
const titled = { title: z.string().trim().min(1, 'every item needs a title').max(T.title), text: text(T.text) };

export const projectInput = z.object({
  name: z.string().trim().min(1).max(80),
  glyph: text(T.glyph),
  subject_id: subject.nullable().default(null),
  tag: text(40),
  /** The card's text on Projects and Home. */
  description: z.string().trim().min(1).max(500),
  platforms: z.array(z.string().trim().max(30)).max(8).default([]),
  /** The project's own website, if it has one (optional since v1.1). */
  landing_url: url(true).default(''),
  tagline: text(T.tagline),
  intro: text(T.intro),
  reasons: list(titled, L.reasons),
  features: list({ glyph: text(T.glyph), ...titled }, L.features),
  steps: list(titled, L.steps),
  faq: list(
    { question: z.string().trim().min(1, 'every question needs its text').max(T.question), answer: text(T.answer) },
    L.faq,
  ),
  downloads: list(
    { label: z.string().trim().min(1, 'every download needs a label').max(T.label), url: url(false) },
    L.downloads,
  ),
  version: text(T.version),
  source_url: url(true).default(''),
  screenshots: z
    .array(z.object({ media_id: uuid, caption: text(T.caption) }))
    .max(L.screenshots)
    .default([]),
});

export type AdminScreenshot = { media_id: string; caption: string; widths: number[] };

export type AdminProject = {
  id: string;
  slug: string;
  name: string;
  glyph: string;
  subject_id: SubjectId | null;
  tag: string;
  description: string;
  platforms: string[];
  landing_url: string | null;
  is_featured: boolean;
  sort: number;
  tagline: string;
  intro: string;
  reasons: ProjectReason[];
  features: ProjectFeature[];
  steps: ProjectStep[];
  faq: ProjectFaq[];
  downloads: ProjectDownload[];
  version: string;
  source_url: string | null;
  screenshots: AdminScreenshot[];
};

const PROJECT_COLUMNS =
  'id, slug, name, glyph, subject_id, tag, description, platforms, landing_url, is_featured, sort, ' +
  'tagline, intro, reasons, features, steps, faq, downloads, version, source_url';

export async function listProjects(supabase: SupabaseClient): Promise<AdminProject[]> {
  const [projects, shots] = await Promise.all([
    supabase.from('projects').select(PROJECT_COLUMNS).order('sort').order('name'),
    supabase.from('project_screenshots').select('project_id, media_id, caption, widths').order('position'),
  ]);
  if (projects.error) refused(projects.error, 'projects');
  if (shots.error) refused(shots.error, 'project_screenshots');
  const rows = shots.data as (AdminScreenshot & { project_id: string })[];
  return (projects.data as unknown as Omit<AdminProject, 'screenshots'>[]).map((p) => ({
    ...p,
    screenshots: rows
      .filter((s) => s.project_id === p.id)
      .map((s) => ({ media_id: s.media_id, caption: s.caption, widths: s.widths })),
  }));
}

/** Home, Projects and the project's own page. */
async function projectPages(supabase: SupabaseClient, id: string): Promise<string[]> {
  const { data, error } = await supabase.from('projects').select('slug').eq('id', id).maybeSingle();
  if (error) refused(error, 'projects');
  return data ? [...PROJECT_PAGES, `/projects/${(data as { slug: string }).slug}`] : PROJECT_PAGES;
}

/** Adds (id null) or edits a project. A new one gets a slug from its name: -2, -3… if taken. */
export async function saveProject(supabase: SupabaseClient, id: string | null, input: unknown) {
  const p = parse(projectInput, input);
  if (id !== null) {
    await call(supabase, 'admin_save_project', { p_id: uuid.parse(id), p });
    return { id, paths: await projectPages(supabase, id) };
  }
  const base = postSlug(p.name, 'project');
  for (let n = 1; n <= 20; n++) {
    const slug = n === 1 && base !== 'project' ? base : `${base}-${n}`;
    const { data, error } = await supabase.rpc('admin_save_project', { p_id: null, p: { ...p, slug } });
    if (!error) return { id: data as string, paths: [...PROJECT_PAGES, `/projects/${slug}`] };
    if (error.code !== '23505') refused(error, 'admin_save_project');
  }
  throw new PostError(409, 'could not find a free address for this project');
}

export async function featureProject(supabase: SupabaseClient, id: unknown) {
  await call(supabase, 'admin_feature_project', { p_id: id === null ? null : uuid.parse(id) });
  return { paths: PROJECT_PAGES };
}

export async function deleteProject(supabase: SupabaseClient, id: string) {
  // Listed first: its page goes too (a 404 from now on).
  const paths = await projectPages(supabase, uuid.parse(id));
  await call(supabase, 'admin_delete_project', { p_id: id });
  return { paths };
}

export async function reorderProjects(supabase: SupabaseClient, input: unknown) {
  const { ids } = parse(z.object({ ids: z.array(uuid).max(200) }), input);
  await call(supabase, 'admin_reorder_projects', { p_ids: ids });
  return { paths: PROJECT_PAGES };
}

// ── Author page (ADM-14) ────────────────────────────────────────────────────

export const AUTHOR_PAGES = ['/author'];

const count = z.number().int().min(0).max(1_000_000).nullable().default(null);

const authorItem = z.object({
  title: z.string().trim().min(1).max(300),
  subtitle: z.string().trim().max(200).default(''),
  period: z.string().trim().max(40).default(''),
  note: z.string().trim().max(2000).default(''),
  url: z
    .string()
    .trim()
    .nullable()
    .default(null)
    .transform((v) => v || null)
    .superRefine((v, ctx) => {
      const problem = v && landingUrlProblem(v);
      if (problem) ctx.addIssue({ code: 'custom', message: problem });
    }),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  visible: z.boolean().default(true),
});

const authorSection = z.object({
  kind: z.enum([...BUILT_IN, 'custom']),
  title: z.string().trim().min(1).max(80),
  visible: z.boolean().default(true),
  items: z.array(authorItem).max(50).default([]),
});

export const authorInput = z.object({
  profile: z.object({
    name: z.string().trim().min(1).max(80),
    /** Markdown. */
    bio: z.string().trim().max(5000).default(''),
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
    /** The photo's frame (and the initials'). */
    photo_shape: z.enum(PHOTO_SHAPES).default('hexagon'),
    /** Parts of the header that visitors don't see. */
    hidden: z.array(z.enum(HEADER_PARTS)).max(HEADER_PARTS.length).default([]),
  }),
  /** The page's sections in order: each built-in once, custom ones as many as wanted (up to 40 in all). */
  sections: z
    .array(authorSection)
    .max(40)
    .superRefine((list, ctx) => {
      for (const kind of BUILT_IN) {
        const n = list.filter((s) => s.kind === kind).length;
        if (n !== 1) ctx.addIssue({ code: 'custom', message: `the ${kind} section must be there once` });
      }
      if (list.some((s) => s.kind === 'life_posts' && s.items.length))
        ctx.addIssue({ code: 'custom', message: 'life posts come from the posts, not items' });
    }),
});
export type AuthorInput = z.input<typeof authorInput>;

export type AuthorPhoto = { id: string; widths: number[] };

type SectionRow = Omit<AuthorSection, 'items'> & { author_items: (AuthorItem & { sort: number })[] };

export async function getAuthor(supabase: SupabaseClient) {
  const [profile, sections] = await Promise.all([
    supabase
      .from('profile')
      .select('name, bio, years, students, email, photo_media_id, photo_shape, photo_widths, hidden')
      .maybeSingle(),
    supabase
      .from('author_sections')
      .select('kind, title, visible, author_items(title, subtitle, period, note, url, tags, visible, sort)')
      .order('sort')
      .order('sort', { referencedTable: 'author_items' }),
  ]);
  if (profile.error) refused(profile.error, 'profile');
  if (sections.error) refused(sections.error, 'author_sections');
  const { photo_widths, ...p } = profile.data ?? {
    name: '',
    bio: '',
    years: null,
    students: null,
    email: null,
    photo_media_id: null,
    photo_shape: 'hexagon',
    photo_widths: [],
    hidden: [],
  };
  return {
    profile: { ...p, email: p.email ?? '' } as z.infer<typeof authorInput>['profile'],
    /** For the preview in the admin. */
    photo: (p.photo_media_id ? { id: p.photo_media_id, widths: photo_widths } : null) as AuthorPhoto | null,
    sections: (sections.data as unknown as SectionRow[]).map(({ author_items, ...s }) => ({
      ...s,
      items: author_items.map((i) => cleanItem(s.kind, i)),
    })) as AuthorSection[],
  };
}

/** Saves the whole page in one go: the header, then every section and item in the order given. */
export async function saveAuthor(supabase: SupabaseClient, input: unknown) {
  const { profile, sections } = parse(authorInput, input);
  await call(supabase, 'admin_save_author', {
    p: { profile, sections: sections.map((s) => ({ ...s, items: s.items.map((i) => cleanItem(s.kind, i)) })) },
  });
  return { paths: AUTHOR_PAGES };
}

/** The bio's live preview: exactly what visitors will see, from the same renderer. */
export async function previewBio(input: unknown) {
  const { bio } = parse(z.object({ bio: z.string().max(5000).default('') }), input);
  return { html: (await renderSnippet(bio)).html };
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
