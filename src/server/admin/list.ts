import type { SupabaseClient } from '@supabase/supabase-js';
import { searchPattern, type Dashboard, type PostFilters, type PostListItem } from '@/lib/admin-posts';
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

/** How many posts are in each state, counted by the database (no rows are sent). */
async function postCounts(supabase: SupabaseClient): Promise<Dashboard['counts']> {
  const count = () => supabase.from('admin_posts').select('id', { count: 'exact', head: true });
  const [published, scheduled, drafts, life] = await Promise.all([
    count().eq('status', 'published'),
    count().eq('status', 'scheduled'),
    count().not('status', 'in', '(published,scheduled)'),
    count().eq('kind', 'life'),
  ]);
  for (const r of [published, scheduled, drafts, life]) if (r.error) throw new Error(`admin_posts: ${r.error.message}`);
  return {
    published: published.count ?? 0,
    drafts: drafts.count ?? 0,
    scheduled: scheduled.count ?? 0,
    life: life.count ?? 0,
  };
}

export async function dashboard(supabase: SupabaseClient): Promise<Dashboard> {
  const [counts, recent, activity, waiting] = await Promise.all([
    postCounts(supabase),
    supabase.from('admin_posts').select(LIST_COLUMNS).order('updated_at', { ascending: false }).limit(5),
    listActivity(supabase, { limit: 8 }),
    supabase.from('questions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  if (recent.error) throw new Error(`admin_posts: ${recent.error.message}`);
  if (waiting.error) throw new Error(`questions: ${waiting.error.message}`);
  return {
    counts,
    recent: recent.data as PostListItem[],
    activity: activity.events,
    questions: waiting.count ?? 0,
  };
}
