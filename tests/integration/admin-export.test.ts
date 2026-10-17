import type { SupabaseClient } from '@supabase/supabase-js';
import { parse as parseYaml } from 'yaml';
import { EXPORT_TABLES, exportZip, type ExportData } from '@/server/export/bundle';
import { markdownToDoc } from '@/server/content/markdown';
import { createPost, saveDraft } from '@/server/admin/posts';
import { ownerSession, serviceClient } from '../support/admin-users';
import { unzip } from '../support/unzip';

// 03 ADM-16 against a real database: the owner's export holds every row of every content
// table, and each post as Markdown that converts back to the same document.

let owner: SupabaseClient;
let service: SupabaseClient;

beforeAll(async () => {
  owner = await ownerSession();
  service = serviceClient();
  await service.from('posts').delete().like('slug', 'it-export-%');
  // A post with a saved earlier version, so there is revision history to export.
  const { id } = await createPost(owner, { kind: 'life', title: 'IT export: history' });
  await saveDraft(owner, id, 1, { title: 'IT export: history, edited' });
});
afterAll(async () => {
  await service.from('posts').delete().like('slug', 'it-export-%');
});

describe('the content export', () => {
  it('holds every row of every content table, and a Markdown file per post', async () => {
    const { filename, body, counts, omitted } = await exportZip(owner, { now: new Date('2026-10-17T10:00:00Z') });
    expect(filename).toBe('codingspace-export-2026-10-17.zip');
    expect(omitted).toEqual([]);

    const files = unzip(body);
    const data = JSON.parse(files.get('content.json')!) as ExportData;
    for (const { name } of EXPORT_TABLES) {
      const { count } = await service.from(name).select('*', { count: 'exact', head: true });
      expect(data.tables[name], name).toHaveLength(count ?? 0);
      expect(counts[name]).toBe(count);
    }
    expect(data.tables.posts.length).toBeGreaterThan(0);
    expect(data.tables.posts[0]).not.toHaveProperty('live_search');

    const md = [...files.keys()].filter((f) => f.startsWith('posts/'));
    expect(md).toHaveLength(data.tables.posts.length);
    expect(files.get('README.md')).toContain('content.json');
  });

  it('writes posts that convert back to the same document', async () => {
    const files = unzip((await exportZip(owner)).body);
    const data = JSON.parse(files.get('content.json')!) as ExportData;
    // Imported from content/posts, so its JSON is exactly what the Markdown importer makes.
    const post = data.tables.posts.find((p) => p.slug === 'am-gm-inequality')!;
    const file = files.get('posts/math/am-gm-inequality.md')!;
    const [, front, body] = /^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/.exec(file)!;
    expect(parseYaml(front!)).toMatchObject({ title: post.title, section: 'inequalities', status: 'published' });
    expect(markdownToDoc(body!).doc).toEqual(post.content_json);
  });

  it('leaves out the revision history when the download would be too big', async () => {
    const { body, omitted } = await exportZip(owner, { maxBytes: 1 });
    const files = unzip(body);
    const data = JSON.parse(files.get('content.json')!) as ExportData;
    expect(omitted).toEqual(['post_revisions']);
    expect(data.tables.post_revisions).toEqual([]);
    expect(files.get('README.md')).toContain('Left out');
  });
});
