import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContentStore } from './import';

/**
 * ContentStore backed by Supabase. Needs the service-role key (it writes past RLS),
 * so it is only used from the import script, never from the web app.
 * Not one transaction: if a step fails, fix the cause and run the import again.
 */
export function supabaseStore(db: SupabaseClient): ContentStore {
  const check = <T>({ data, error }: { data: T; error: { message: string } | null }, what: string): T => {
    if (error) throw new Error(`${what}: ${error.message}`);
    return data;
  };
  // Delete-all filter: PostgREST refuses an unfiltered delete.
  const all = 'id';

  return {
    async upsertSections(rows) {
      const data = check(
        await db.from('sections').upsert(rows, { onConflict: 'subject_id,slug' }).select('id, subject_id, slug'),
        'sections',
      );
      return new Map((data ?? []).map((s) => [`${s.subject_id}/${s.slug}`, s.id as string]));
    },

    async publishedAt() {
      const data = check(await db.from('posts').select('slug, published_at'), 'posts');
      return new Map((data ?? []).map((p) => [p.slug as string, p.published_at as string | null]));
    },

    async upsertPosts(rows) {
      check(await db.from('posts').upsert(rows, { onConflict: 'slug' }), 'posts');
    },

    async replaceProjects(rows) {
      check(await db.from('projects').delete().not(all, 'is', null), 'projects (clear)');
      if (rows.length) check(await db.from('projects').insert(rows), 'projects');
    },

    async upsertProfile(row) {
      check(await db.from('profile').upsert(row, { onConflict: 'id' }), 'profile');
    },

    async replaceTimeline(rows) {
      check(await db.from('timeline_items').delete().not(all, 'is', null), 'timeline (clear)');
      if (rows.length) check(await db.from('timeline_items').insert(rows), 'timeline');
    },

    async hasSiteContent() {
      const counts = await Promise.all(
        ['projects', 'profile', 'timeline_items', 'featured_problems'].map(async (t) => {
          const { count, error } = await db.from(t).select('*', { count: 'exact', head: true });
          if (error) throw new Error(`${t}: ${error.message}`);
          return count ?? 0;
        }),
      );
      return counts.some((n) => n > 0);
    },
    async replaceFeaturedProblems(rows) {
      check(await db.from('featured_problems').delete().not(all, 'is', null), 'featured problems (clear)');
      if (rows.length) check(await db.from('featured_problems').insert(rows), 'featured problems');
    },
  };
}
