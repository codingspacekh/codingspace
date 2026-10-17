import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { postSlug, revalidationPaths, type PublishedRef } from '@/lib/post-rules';
import { PostError } from './posts';

export const newSection = z.object({
  subject_id: z.enum(['math', 'physics', 'coding', 'it']),
  title: z.string().trim().min(1).max(120),
  description: z.string().max(500).default(''),
});

/**
 * Adds a section at the end of its subject (03 ADM-12, the "add" part). The slug comes from
 * the title, with -2, -3… if the subject already has it; Khmer titles get section-N.
 */
export async function createSection(supabase: SupabaseClient, input: unknown) {
  const parsed = newSection.safeParse(input);
  if (!parsed.success) throw new PostError(422, z.prettifyError(parsed.error));
  const { subject_id, title, description } = parsed.data;
  const base = postSlug(title, 'section');
  for (let n = 1; n <= 20; n++) {
    const slug = n === 1 && base !== 'section' ? base : `${base}-${n}`;
    const { data, error } = await supabase.rpc('admin_create_section', {
      p_subject_id: subject_id,
      p_title: title,
      p_slug: slug,
      p_description: description,
    });
    if (!error) {
      const { data: row } = await supabase.from('sections').select('sort').eq('id', data).single();
      return { id: data as string, subject_id, slug, title, sort: (row?.sort as number) ?? 0 };
    }
    if (error.code !== '23505') {
      if (error.code === '42501') throw new PostError(404, 'not allowed');
      throw new Error(`admin_create_section: ${error.message}`);
    }
  }
  throw new PostError(409, 'could not find a free address for this section');
}

export type StructureLesson = {
  id: string;
  title: string;
  slug: string;
  status: string;
  has_unpublished_changes: boolean;
};
export type StructureSection = {
  id: string;
  slug: string;
  title: string;
  description: string;
  sort: number;
  lessons: StructureLesson[];
};

const subjectId = z.enum(['math', 'physics', 'coding', 'it']);
const uuid = z.uuid();

/** A subject's sections in order, each with its lessons (drafts too) in order. */
export async function listStructure(supabase: SupabaseClient, subject: unknown): Promise<StructureSection[]> {
  const s = subjectId.parse(subject);
  const [sections, lessons] = await Promise.all([
    supabase
      .from('sections')
      .select('id, slug, title, description, sort')
      .eq('subject_id', s)
      .order('sort')
      .order('slug'),
    supabase
      .from('admin_posts')
      .select('id, title, slug, status, has_unpublished_changes, section_id, sort')
      .eq('kind', 'lesson')
      .not('section_id', 'is', null)
      .order('sort')
      .order('slug'),
  ]);
  if (sections.error) throw new Error(`sections: ${sections.error.message}`);
  if (lessons.error) throw new Error(`admin_posts: ${lessons.error.message}`);
  return sections.data.map((sec) => ({
    ...sec,
    lessons: lessons.data
      .filter((l) => l.section_id === sec.id)
      .map(({ id, title, slug, status, has_unpublished_changes }) => ({
        id,
        title,
        slug,
        status,
        has_unpublished_changes,
      })),
  }));
}

function refused(error: { code?: string; message: string }, what: string): never {
  const status = { PT404: 404, PT409: 409, PT422: 422, '23514': 422, '22P02': 400 }[error.code ?? ''];
  if (status) throw new PostError(status as PostError['status'], error.message);
  throw new Error(`${what}: ${error.message}`);
}

/** Pages that show a subject's sections: the subject page and every live lesson in those sections. */
async function pagesFor(supabase: SupabaseClient, subject: string, sectionIds: string[]): Promise<string[]> {
  const paths = [`/study/${subject}`];
  if (sectionIds.length) {
    const { data, error } = await supabase.from('public_posts').select('slug').in('section_id', sectionIds);
    if (error) throw new Error(`public_posts: ${error.message}`);
    for (const r of data ?? []) paths.push(`/posts/${r.slug}`);
  }
  return paths;
}

export const sectionEdit = z.object({ title: z.string().max(120), description: z.string().max(500).default('') });

export async function updateSection(supabase: SupabaseClient, id: string, input: unknown) {
  const body = sectionEdit.safeParse(input);
  if (!body.success) throw new PostError(422, z.prettifyError(body.error));
  const { data, error } = await supabase.rpc('admin_update_section', {
    p_id: uuid.parse(id),
    p_title: body.data.title,
    p_description: body.data.description,
  });
  if (error) refused(error, 'admin_update_section');
  const { subject } = data as { subject: string };
  return { paths: await pagesFor(supabase, subject, [id]) };
}

type DeletedLesson = PublishedRef & { was_published: boolean };

/**
 * Deletes a section and every lesson filed under it (owner request, 2026-10-17). Rebuilds the
 * subject page and, for lessons that were live, their pages (now 404), Home, and the lessons
 * left in any other section one of them was live in.
 */
export async function deleteSection(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.rpc('admin_delete_section', { p_id: uuid.parse(id) });
  if (error) refused(error, 'admin_delete_section');
  const { subject, lessons } = data as { subject: string; lessons: DeletedLesson[] };
  const live = lessons.filter((l) => l.was_published);
  const otherSections = [...new Set(live.map((l) => l.section).filter((s): s is string => !!s && s !== id))];
  const neighbours = otherSections.length ? (await pagesFor(supabase, subject, otherSections)).slice(1) : [];
  const paths = [`/study/${subject}`, ...live.flatMap((l) => revalidationPaths(l)), ...neighbours];
  return { paths: [...new Set(paths)], deleted: lessons.length };
}

export const sectionOrder = z.object({ subject_id: subjectId, ids: z.array(uuid).max(200) });

export async function reorderSections(supabase: SupabaseClient, input: unknown) {
  const body = sectionOrder.safeParse(input);
  if (!body.success) throw new PostError(422, z.prettifyError(body.error));
  const { error } = await supabase.rpc('admin_reorder_sections', {
    p_subject_id: body.data.subject_id,
    p_ids: body.data.ids,
  });
  if (error) refused(error, 'admin_reorder_sections');
  // Lesson pages don't show section order; the subject page does.
  return { paths: [`/study/${body.data.subject_id}`] };
}

export const lessonOrder = z.object({ ids: z.array(uuid).max(500) });

export async function reorderLessons(supabase: SupabaseClient, sectionId: string, input: unknown) {
  const body = lessonOrder.safeParse(input);
  if (!body.success) throw new PostError(422, z.prettifyError(body.error));
  const { data, error } = await supabase.rpc('admin_reorder_lessons', {
    p_section_id: uuid.parse(sectionId),
    p_ids: body.data.ids,
  });
  if (error) refused(error, 'admin_reorder_lessons');
  const { subject } = data as { subject: string };
  return { paths: await pagesFor(supabase, subject, [sectionId]) };
}
