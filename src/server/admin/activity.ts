import type { SupabaseClient } from '@supabase/supabase-js';
import { HIDDEN_ACTIONS, type ActivityEvent, type ActivityPage } from '@/lib/activity';

/**
 * The audit log, newest first (03 ADM-15). RLS lets only the owner read it. Each event gets the
 * item's current name (a post's title, a file's name…), so renamed items read as they are now;
 * deleted ones fall back to the name kept in the event.
 */

export const PAGE_SIZE = 50;

// Where each kind of item keeps its name.
const NAMES = {
  post: { from: 'admin_posts', column: 'title' },
  section: { from: 'sections', column: 'title' },
  media: { from: 'media', column: 'original_name' },
  project: { from: 'projects', column: 'name' },
} as const;

export async function listActivity(
  supabase: SupabaseClient,
  { before, limit = PAGE_SIZE }: { before?: number; limit?: number } = {},
): Promise<ActivityPage> {
  let query = supabase
    .from('audit_events')
    .select('id, action, entity, entity_id, meta, at')
    .not('action', 'in', `(${HIDDEN_ACTIONS.join(',')})`)
    .order('id', { ascending: false })
    .limit(limit + 1);
  if (before) query = query.lt('id', before);
  const { data, error } = await query;
  if (error) throw new Error(`audit_events: ${error.message}`);

  const rows = (data as Omit<ActivityEvent, 'name'>[]).slice(0, limit);
  const names = await currentNames(supabase, rows);
  return {
    events: rows.map((r) => ({ ...r, name: names.get(`${r.entity}:${r.entity_id}`) ?? null })),
    more: data.length > limit,
  };
}

async function currentNames(supabase: SupabaseClient, rows: Omit<ActivityEvent, 'name'>[]) {
  const names = new Map<string, string>();
  await Promise.all(
    (Object.keys(NAMES) as (keyof typeof NAMES)[]).map(async (entity) => {
      const ids = [...new Set(rows.filter((r) => r.entity === entity && r.entity_id).map((r) => r.entity_id))];
      if (!ids.length) return;
      const { from, column } = NAMES[entity];
      const { data, error } = await supabase.from(from).select(`id, ${column}`).in('id', ids);
      if (error) throw new Error(`${from}: ${error.message}`);
      for (const row of data as unknown as Record<string, string>[]) {
        if (row[column]) names.set(`${entity}:${row.id}`, row[column]);
      }
    }),
  );
  return names;
}
