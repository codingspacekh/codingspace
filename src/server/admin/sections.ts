import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { postSlug } from '@/lib/post-rules';
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
