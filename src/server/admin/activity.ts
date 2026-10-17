import type { SupabaseClient } from '@supabase/supabase-js';
import { HIDDEN_ACTIONS, type ActivityEvent, type ActivityPage } from '@/lib/activity';

/**
 * The audit log, newest first (03 ADM-15). RLS lets only the owner read it. The view gives each
 * event the item's current name (a post's title, a file's name…), so renamed items read as they
 * are now; deleted ones fall back to the name kept in the event.
 */

export const PAGE_SIZE = 50;

export async function listActivity(
  supabase: SupabaseClient,
  { before, limit = PAGE_SIZE }: { before?: number; limit?: number } = {},
): Promise<ActivityPage> {
  let query = supabase
    .from('admin_activity_events')
    .select('id, action, entity, entity_id, meta, at, name')
    .not('action', 'in', `(${HIDDEN_ACTIONS.join(',')})`)
    .order('id', { ascending: false })
    .limit(limit + 1);
  if (before) query = query.lt('id', before);
  const { data, error } = await query;
  if (error) throw new Error(`admin_activity_events: ${error.message}`);
  return { events: (data as ActivityEvent[]).slice(0, limit), more: data.length > limit };
}
