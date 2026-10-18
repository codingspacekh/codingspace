import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { normalizeDoc } from '@/lib/content-json';
import { postSlug, revalidationPaths, scheduleProblem, type PublishedRef } from '@/lib/post-rules';
import { SUBJECT_ID } from '@/lib/subjects';
import { renderContent } from '@/server/render';
import { ApiError, dbError, rpc } from './errors';
import { SLUG } from '@/lib/slug';

/**
 * Post changes for the admin API (03 ADM-03, ADM-05…09). Each call is one admin_* database
 * function, so the change, its revision and its audit row commit together or not at all.
 * The client passed in decides who is acting: the owner's session, or the service role (cron).
 */

const uuid = z.uuid();
// Any subject's id; the database checks that it exists (foreign key → 422).
const subjectId = z.string().regex(SUBJECT_ID);

/** What the editor may save (03 ADM-04/05). The database checks the same limits again. */
export const draftFields = z
  .object({
    title: z.string().max(200),
    summary: z.string().max(500),
    content_json: z.object({ type: z.literal('doc'), content: z.array(z.unknown()) }).loose(),
    slug: z.string().regex(SLUG).max(80),
    subject_id: subjectId.nullable(),
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
  subject_id: subjectId.nullable().default(null),
  section_id: uuid.nullable().default(null),
  lang: z.enum(['en', 'km']).default('en'),
});

/** Creates a draft with a slug from its title; adds -2, -3… if the slug is taken. */
export async function createPost(supabase: SupabaseClient, input: z.input<typeof newPost>, now = new Date()) {
  const p = newPost.parse(input);
  if (p.kind === 'lesson' && !p.subject_id) throw new ApiError(422, 'a lesson needs a subject');
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
    if (error.code !== '23505') dbError(error, 'admin_create_post');
  }
  throw new ApiError(409, 'could not find a free URL for this title');
}

/** Autosave. Returns the new revision; 409 if another tab saved first. */
export async function savePost(supabase: SupabaseClient, id: string, revision: number, fields: unknown) {
  const parsed = draftFields.safeParse(fields);
  if (!parsed.success) throw new ApiError(422, z.prettifyError(parsed.error));
  return rpc<number>(supabase, 'admin_save_post', {
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
  if (error) dbError(error, 'posts');
  if (!draft) throw new ApiError(404, 'post not found');
  // Renders only what the caller has seen; the function re-checks under a row lock.
  if (draft.revision !== revision) throw new ApiError(409, `the post changed since revision ${revision}`);

  const out = await renderContent(draft.content_json, { lang: draft.lang });
  const result = await rpc<Omit<Published, 'paths'>>(supabase, 'admin_publish_post', {
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
  return { ...result, paths: await pagesShowing(supabase, id, result) };
}

/** Every static page that shows the post: its own, its subject's, its section's, series' and syllabuses'… */
async function pagesShowing(supabase: SupabaseClient, id: string, ref: PublishedRef, series?: string[]) {
  const [lessons, seriesPaths] = await Promise.all([
    sectionLessons(supabase, ref),
    series ?? listingPages(supabase, id),
  ]);
  return [...new Set([...revalidationPaths(ref, lessons), ...seriesPaths])];
}

/**
 * The series and syllabuses the post is in (v1.1): series pages, the series list and their
 * lessons' pages ("Part n of N", previous/next), and the syllabus pages listing it, all change
 * when it comes or goes.
 */
async function listingPages(supabase: SupabaseClient, id: string): Promise<string[]> {
  const [inSeries, inSyllabus] = await Promise.all([
    supabase.from('series_lessons').select('series_id').eq('post_id', id),
    supabase.from('post_syllabus').select('syllabus_points(syllabuses(slug))').eq('post_id', id),
  ]);
  if (inSeries.error) dbError(inSeries.error, 'series_lessons');
  if (inSyllabus.error) dbError(inSyllabus.error, 'post_syllabus');
  const syllabuses = [
    ...new Set(
      (inSyllabus.data as unknown as { syllabus_points: { syllabuses: { slug: string } | null } | null }[]).flatMap(
        (r) => (r.syllabus_points?.syllabuses ? [`/syllabus/${r.syllabus_points.syllabuses.slug}`] : []),
      ),
    ),
  ];
  const syllabusPaths = syllabuses.length ? ['/syllabus', ...syllabuses] : [];
  const ids = (inSeries.data ?? []).map((r) => r.series_id as string);
  if (!ids.length) return syllabusPaths;
  const [series, lessons] = await Promise.all([
    supabase.from('series').select('slug').in('id', ids),
    supabase.from('public_series_lessons').select('slug').in('series_id', ids),
  ]);
  if (series.error) dbError(series.error, 'series');
  if (lessons.error) dbError(lessons.error, 'public_series_lessons');
  return [
    '/series',
    ...series.data.map((r) => `/series/${r.slug as string}`),
    ...lessons.data.map((r) => `/posts/${r.slug as string}`),
    ...syllabusPaths,
  ];
}

/** Live lessons in the post's section(s), whose pages list it (prev/next, section list). */
async function sectionLessons(supabase: SupabaseClient, ref: PublishedRef): Promise<string[]> {
  const sections = [...new Set([ref.section, ref.previous_section].filter((s): s is string => !!s))];
  if (!sections.length) return [];
  const { data, error } = await supabase.from('public_posts').select('slug').in('section_id', sections);
  if (error) dbError(error, 'public_posts');
  return (data ?? []).map((r) => r.slug as string);
}

export async function unpublishPost(supabase: SupabaseClient, id: string) {
  const result = await rpc<PublishedRef>(supabase, 'admin_unpublish_post', { p_id: uuid.parse(id) });
  return { ...result, paths: await pagesShowing(supabase, id, result) };
}

export async function schedulePost(supabase: SupabaseClient, id: string, revision: number, at: Date, now = new Date()) {
  const problem = scheduleProblem(at, now);
  if (problem) throw new ApiError(422, `schedule time: ${problem}`);
  await rpc(supabase, 'admin_schedule_post', { p_id: uuid.parse(id), p_revision: revision, p_at: at.toISOString() });
}

export async function unschedulePost(supabase: SupabaseClient, id: string) {
  await rpc(supabase, 'admin_unschedule_post', { p_id: uuid.parse(id) });
}

export async function restoreRevision(supabase: SupabaseClient, id: string, revision: number, revisionId: number) {
  return rpc<number>(supabase, 'admin_restore_revision', {
    p_id: uuid.parse(id),
    p_revision: revision,
    p_revision_id: revisionId,
  });
}

export async function deletePost(supabase: SupabaseClient, id: string) {
  // Read before deleting: the lesson leaves its series and syllabus points with it.
  const series = await listingPages(supabase, uuid.parse(id));
  const result = await rpc<PublishedRef & { was_published: boolean }>(supabase, 'admin_delete_post', {
    p_id: id,
  });
  return {
    ...result,
    paths: result.was_published ? await pagesShowing(supabase, id, result, series) : [],
  };
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
  if (error) dbError(error, 'due posts');
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

export type EditablePost = {
  id: string;
  kind: 'lesson' | 'life';
  slug: string;
  title: string;
  summary: string;
  content_json: unknown;
  subject_id: string | null;
  section_id: string | null;
  sort: number;
  level: number;
  minutes: number;
  problem_count: number;
  lang: 'en' | 'km';
  status: 'draft' | 'scheduled' | 'published';
  revision: number;
  published_at: string | null;
  scheduled_at: string | null;
  has_unpublished_changes: boolean;
};

/** The draft for the editor, with every section (for the dependent Section menu). */
export async function getPostForEdit(supabase: SupabaseClient, id: string) {
  const [post, sections] = await Promise.all([
    supabase
      .from('posts')
      .select(
        'id, kind, slug, title, summary, content_json, subject_id, section_id, sort, level, minutes, problem_count, lang, status, revision, live_revision, published_at, scheduled_at',
      )
      .eq('id', uuid.parse(id))
      .maybeSingle(),
    supabase.from('sections').select('id, subject_id, slug, title, sort').order('sort'),
  ]);
  if (post.error) dbError(post.error, 'posts');
  if (sections.error) dbError(sections.error, 'sections');
  if (!post.data) throw new ApiError(404, 'post not found');
  const { live_revision, ...rest } = post.data;
  return {
    post: {
      ...rest,
      has_unpublished_changes: rest.status === 'published' && rest.revision > (live_revision ?? 0),
    } as EditablePost,
    sections: sections.data as { id: string; subject_id: string; slug: string; title: string; sort: number }[],
  };
}

/**
 * Saves the editor's draft. Until the first publish the URL follows the title (a free
 * slug: -2, -3… if taken); after it, the URL is fixed and the title can change freely.
 */
export async function saveDraft(
  supabase: SupabaseClient,
  id: string,
  revision: number,
  fields: unknown,
): Promise<{ revision: number; slug: string }> {
  const parsed = draftFields.safeParse(fields);
  if (!parsed.success) throw new ApiError(422, z.prettifyError(parsed.error));
  // The slug is the server's to set (below), never the client's.
  const data = { ...parsed.data };
  delete data.slug;
  if (data.content_json) data.content_json = normalizeDoc(data.content_json);

  const { data: current, error } = await supabase
    .from('posts')
    .select('slug, published_at')
    .eq('id', uuid.parse(id))
    .maybeSingle();
  if (error) dbError(error, 'posts');
  if (!current) throw new ApiError(404, 'post not found');

  let slug = current.slug as string;
  if (data.title !== undefined && current.published_at === null) {
    const wanted = postSlug(data.title, slug);
    // Already this title's slug, or its -2/-3 variant: keep it.
    const matches = slug === wanted || new RegExp(`^${wanted}-\\d+$`).test(slug);
    if (!matches) slug = await freeSlug(supabase, wanted, id);
  }
  const next = await savePost(supabase, id, revision, slug === current.slug ? data : { ...data, slug });
  return { revision: next, slug };
}

async function slugTaken(supabase: SupabaseClient, slug: string, except: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('slug', slug)
    .neq('id', except);
  if (error) dbError(error, 'posts');
  return (count ?? 0) > 0;
}

async function freeSlug(supabase: SupabaseClient, base: string, except: string): Promise<string> {
  for (let n = 1; n <= 50; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (!(await slugTaken(supabase, slug, except))) return slug;
  }
  throw new ApiError(409, 'could not find a free URL for this title');
}

export type RevisionItem = {
  id: number;
  revision: number;
  reason: 'autosave' | 'publish' | 'restore' | 'before_restore';
  title: string;
  created_at: string;
};

/** The draft's history, newest first (03 ADM-06; the database keeps the last 50). */
export async function listRevisions(supabase: SupabaseClient, postId: string): Promise<RevisionItem[]> {
  const { data, error } = await supabase
    .from('post_revisions')
    .select('id, revision, reason, title, created_at')
    .eq('post_id', uuid.parse(postId))
    .order('id', { ascending: false });
  if (error) dbError(error, 'post_revisions');
  return data as RevisionItem[];
}

const revisionId = z.coerce.number().int().positive();

/** One revision, rendered exactly as students would see it, to compare before restoring. */
export async function revisionPreview(supabase: SupabaseClient, postId: string, id: unknown) {
  const { data, error } = await supabase
    .from('post_revisions')
    .select('id, revision, reason, title, summary, content_json, created_at, posts!inner(lang)')
    .eq('post_id', uuid.parse(postId))
    .eq('id', revisionId.parse(id))
    .maybeSingle();
  if (error) dbError(error, 'post_revisions');
  if (!data) throw new ApiError(404, 'revision not found');
  const { content_json, posts, ...meta } = data as typeof data & { posts: { lang: 'en' | 'km' } };
  const { html } = await renderContent(content_json, { lang: posts.lang });
  return { revision: meta as RevisionItem & { summary: string }, html };
}

export { revisionId };
