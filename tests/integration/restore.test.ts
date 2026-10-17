import type { SupabaseClient } from '@supabase/supabase-js';
import { exportZip, type ExportData } from '@/server/export/bundle';
import { readExport, RestoreError, restoreContent } from '@/server/export/restore';
import { ownerSession, serviceClient } from '../support/admin-users';

// The restore drill in miniature (NFR-REL-2), on the local database: export, empty every
// content table, restore, export again — the content must come back exactly. If this test
// dies half-way, run `npm run db:reset` (or content:import) to get the local content back.

let owner: SupabaseClient;
let service: SupabaseClient;

beforeAll(async () => {
  owner = await ownerSession();
  service = serviceClient();
});

/** Children first; post_revisions and post_media go with their posts. */
async function emptyContent(db: SupabaseClient) {
  for (const table of ['posts', 'featured_problems', 'timeline_items', 'projects', 'media', 'sections']) {
    const { error } = await db.from(table).delete().not('id', 'is', null);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  const { error } = await db.from('profile').delete().eq('id', true);
  if (error) throw new Error(`profile: ${error.message}`);
}

/** What a restore can't keep: revision ids (generated) and a problem's updated_at (set by a trigger). */
function comparable(data: ExportData) {
  const t = structuredClone(data.tables);
  for (const r of t.post_revisions) delete r.id;
  for (const r of t.featured_problems) delete r.updated_at;
  return t;
}

describe('restore', () => {
  it('refuses a database that already has content', async () => {
    const data = readExport((await exportZip(owner)).body);
    await expect(restoreContent(service, data)).rejects.toBeInstanceOf(RestoreError);
  });

  it('brings an export back exactly into an emptied database', async () => {
    const before = readExport((await exportZip(owner)).body);
    expect(before.tables.posts.length).toBeGreaterThan(0);

    await emptyContent(service);
    const { count } = await service.from('posts').select('*', { count: 'exact', head: true });
    expect(count).toBe(0);

    const restored = await restoreContent(service, before);
    expect(restored.posts).toBe(before.tables.posts.length);

    const after = readExport((await exportZip(owner)).body);
    expect(comparable(after)).toEqual(comparable(before));
    // And students see the same pages again.
    const { count: live } = await service.from('public_posts').select('*', { count: 'exact', head: true });
    expect(live).toBe(before.tables.posts.filter((p) => p.status === 'published').length);
  });

  it('reads a .zip or its content.json, and nothing else', async () => {
    const { body } = await exportZip(owner);
    const fromZip = readExport(body);
    expect(readExport(Buffer.from(JSON.stringify(fromZip)))).toEqual(fromZip);
    expect(() => readExport(Buffer.from('{"format":2}'))).toThrow(RestoreError);
  });
});
