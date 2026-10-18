import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { importContent } from '@/server/content/import';
import { loadContent } from '@/server/content/load';
import { supabaseStore } from '@/server/content/supabase-store';

/**
 * Imports content/ when its lessons aren't in the database yet. In CI nothing imports before the
 * integration tests (tests/integration/content-import.test.ts does, whenever it runs), so a file
 * that needs the starter lessons calls this first instead of depending on the file order.
 */
export async function ensureContent(service: SupabaseClient) {
  const { data, error } = await service.from('posts').select('id').eq('slug', 'am-gm-inequality').maybeSingle();
  if (error) throw new Error(`posts: ${error.message}`);
  if (data) return;
  await importContent(
    loadContent(join(__dirname, '../../content')),
    supabaseStore(service),
    new Date('2026-10-16T08:00:00Z'),
  );
}
