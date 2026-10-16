import type { SupabaseClient } from '@supabase/supabase-js';
import { isSubjectId } from '@/lib/subjects';
import { renderContent } from '@/server/render';
import type { PostPageData } from '@/server/data/types';
import { getPostForEdit } from './posts';

/**
 * 03 ADM-08: the draft, shaped exactly like a public lesson page's data, so the preview page
 * renders it with the same PostView students get. Owner only (RLS on posts and sections).
 */
export async function previewPost(supabase: SupabaseClient, id: string): Promise<PostPageData> {
  const { post: draft, sections } = await getPostForEdit(supabase, id);
  const out = await renderContent(draft.content_json, { lang: draft.lang });
  const now = new Date().toISOString();
  const post: PostPageData['post'] = {
    slug: draft.slug,
    kind: draft.kind,
    title: draft.title || 'Untitled',
    summary: draft.summary,
    html: out.html,
    toc: out.toc,
    subject: draft.kind === 'lesson' && isSubjectId(draft.subject_id) ? draft.subject_id : null,
    level: draft.level,
    lang: draft.lang,
    minutes: draft.minutes,
    problemCount: draft.problem_count,
    hasMath: out.hasMath,
    publishedAt: draft.published_at ?? now,
    updatedAt: now,
  };
  const section = sections.find((s) => s.id === draft.section_id);
  if (draft.kind !== 'lesson' || !section) return { post, section: null, siblings: [] };

  const { data: live, error } = await supabase
    .from('public_posts')
    .select('slug, title, sort')
    .eq('section_id', section.id)
    .order('sort')
    .order('slug');
  if (error) throw new Error(`public_posts: ${error.message}`);
  // The section as it will be once this draft is live: in its place by sort order, with its new title.
  const siblings = [
    ...(live ?? []).filter((p) => p.slug !== draft.slug),
    { slug: draft.slug, title: post.title, sort: draft.sort },
  ]
    .sort((a, b) => a.sort - b.sort || a.slug.localeCompare(b.slug))
    .map(({ slug, title }) => ({ slug, title }));
  return { post, section: { slug: section.slug, title: section.title }, siblings };
}
