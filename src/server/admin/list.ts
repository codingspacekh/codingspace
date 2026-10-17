import type { SupabaseClient } from '@supabase/supabase-js';
import { countPosts, searchPattern, type Dashboard, type PostFilters, type PostListItem } from '@/lib/admin-posts';
import { listActivity } from './activity';

/** Reads for the posts list and dashboard, through the admin_posts view (owner only, via RLS). */

const LIST_COLUMNS =
  'id, kind, slug, title, subject_id, status, has_unpublished_changes, scheduled_at, published_at, updated_at';
const MAX_ROWS = 500;

export async function listPosts(supabase: SupabaseClient, f: PostFilters): Promise<PostListItem[]> {
  let query = supabase
    .from('admin_posts')
    .select(LIST_COLUMNS)
    .order('updated_at', { ascending: false })
    .limit(MAX_ROWS);
  if (f.kind) query = query.eq('kind', f.kind);
  if (f.subject) query = query.eq('subject_id', f.subject);
  if (f.status === 'changes') query = query.eq('has_unpublished_changes', true);
  else if (f.status) query = query.eq('status', f.status);
  const pattern = f.q ? searchPattern(f.q) : null;
  if (pattern) query = query.or(`title.ilike.${pattern},slug.ilike.${pattern}`);
  const { data, error } = await query;
  if (error) throw new Error(`admin_posts: ${error.message}`);
  return data as PostListItem[];
}

export async function dashboard(supabase: SupabaseClient): Promise<Dashboard> {
  const [all, recent, activity] = await Promise.all([
    supabase.from('admin_posts').select('kind, status'),
    supabase.from('admin_posts').select(LIST_COLUMNS).order('updated_at', { ascending: false }).limit(5),
    listActivity(supabase, { limit: 8 }),
  ]);
  if (all.error) throw new Error(`admin_posts: ${all.error.message}`);
  if (recent.error) throw new Error(`admin_posts: ${recent.error.message}`);
  return {
    counts: countPosts(all.data as Parameters<typeof countPosts>[0]),
    recent: recent.data as PostListItem[],
    activity: activity.events,
  };
}
