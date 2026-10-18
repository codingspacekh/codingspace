// @vitest-environment node
import { listActivity } from '@/server/admin/activity';
import { EXPORT_TABLES, exportEntries, exportZip, postMarkdown, readContent } from '@/server/export/bundle';
import { readExport, RestoreError, restoreContent } from '@/server/export/restore';
import { unzip } from '@/server/export/unzip';
import { zip } from '@/server/export/zip';
import { fakeDb } from './fake-db';

// The server side of ADM-15 and ADM-16 without a database (the integration tests run them
// against one): paging, names, the download limit and the restore's rules.

const p = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const now = new Date('2026-10-17T10:00:00Z');

function content() {
  return {
    subjects: [{ id: 'math' }],
    sections: [{ id: 's1', subject_id: 'math', slug: 'inequalities', title: 'Inequalities' }],
    media: [{ id: 'm1', original_name: 'tri.png' }],
    posts: [
      {
        id: 'p1',
        kind: 'lesson',
        slug: 'am-gm',
        subject_id: 'math',
        section_id: 's1',
        sort: 1,
        level: 2,
        lang: 'en',
        status: 'published',
        title: 'AM–GM',
        summary: '',
        content_json: p('Hello'),
        published_at: '2026-10-16T00:00:00Z',
        live_search: "'hello'",
      },
      {
        id: 'p2',
        kind: 'life',
        slug: 'why',
        subject_id: null,
        section_id: null,
        sort: 0,
        level: 1,
        lang: 'km',
        status: 'draft',
        title: 'Why "this"',
        summary: 'S',
        content_json: p('Hi'),
        published_at: null,
      },
    ],
    post_revisions: [{ id: 1, post_id: 'p1', revision: 1, content_json: p('x'.repeat(5000)) }],
    post_media: [{ post_id: 'p1', media_id: 'm1' }],
    projects: [{ id: 'pr1', name: 'Orbit' }],
    project_screenshots: [{ project_id: 'pr1', position: 1, media_id: 'm1', caption: '' }],
    profile: [{ id: true, name: 'Owner' }],
    author_sections: [{ id: 'timeline', kind: 'timeline', title: 'Timeline', sort: 1 }],
    author_items: [{ id: 'i1', section_id: 'timeline', title: 'Started', period: '2018', sort: 1 }],
    featured_problems: [{ id: 'f1', subject_id: 'math' }],
    series: [{ id: 's1', slug: 'paper-1', title: 'Paper 1', description: '', sort: 1 }],
    series_lessons: [{ series_id: 's1', post_id: 'p1', position: 1 }],
  };
}

describe('listActivity (ADM-15)', () => {
  // admin_activity_events adds each item's current name (a pgTAP test checks the view).
  const events = [
    { id: 1, action: 'post.create', entity: 'post', entity_id: 'p1', meta: {}, at: 'a', name: 'AM–GM' },
    { id: 2, action: 'post.save', entity: 'post', entity_id: 'p1', meta: {}, at: 'b', name: 'AM–GM' },
    { id: 3, action: 'media.add', entity: 'media', entity_id: 'm1', meta: {}, at: 'c', name: 'tri.png' },
    { id: 4, action: 'post.delete', entity: 'post', entity_id: 'gone', meta: { title: 'Old' }, at: 'd', name: null },
    { id: 5, action: 'profile.update', entity: 'profile', entity_id: 'profile', meta: {}, at: 'e', name: null },
  ];
  const db = () => fakeDb({ admin_activity_events: events }).client;

  it('lists newest first without autosaves, with current names, and pages', async () => {
    const first = await listActivity(db(), { limit: 2 });
    expect(first.events.map((e) => [e.id, e.name])).toEqual([
      [5, null],
      [4, null],
    ]);
    expect(first.more).toBe(true);
    const rest = await listActivity(db(), { before: 4 });
    expect(rest.events.map((e) => [e.id, e.name])).toEqual([
      [3, 'tri.png'],
      [1, 'AM–GM'],
    ]);
    expect(rest.more).toBe(false);
  });

  it('is one read', async () => {
    const { client, reads } = fakeDb({ admin_activity_events: events });
    await listActivity(client, { limit: 8 });
    expect(reads).toEqual(['admin_activity_events']);
  });

  it('passes database errors on', async () => {
    const down = fakeDb({}, { fail: { admin_activity_events: 'denied' } }).client;
    await expect(listActivity(down)).rejects.toThrow('admin_activity_events: denied');
  });
});

describe('the export bundle (ADM-16)', () => {
  it('reads every table, page by page, without generated columns', async () => {
    const many = Array.from({ length: 1001 }, (_, i) => ({ id: i + 1, post_id: 'p1', revision: i }));
    const data = await readContent(fakeDb({ ...content(), post_revisions: many }).client, now);
    expect(Object.keys(data.tables)).toEqual(EXPORT_TABLES.map((t) => t.name));
    expect(data.tables.post_revisions).toHaveLength(1001);
    expect(data.tables.posts[0]).not.toHaveProperty('live_search');
    expect(data.exported_at).toBe('2026-10-17T10:00:00.000Z');
    await expect(readContent(fakeDb(content(), { fail: { media: 'nope' } }).client)).rejects.toThrow('media: nope');
  });

  it('writes lessons and life posts as content:import reads them', () => {
    const sections = new Map([['s1', 'inequalities']]);
    const [lesson, life] = content().posts;
    expect(postMarkdown(lesson!, sections)).toEqual({
      path: 'posts/math/am-gm.md',
      data:
        '---\ntitle: "AM–GM"\nsection: "inequalities"\nsort: 1\nlevel: 2\nlang: "en"\nstatus: "published"\n' +
        'published_at: "2026-10-16T00:00:00Z"\n---\n\nHello\n',
    });
    const md = postMarkdown(life!, sections);
    expect(md.path).toBe('posts/life/why.md');
    expect(md.data).toContain('title: "Why \\"this\\""\nsummary: "S"\nsort: 0\nlang: "km"\nstatus: "draft"\n---');
    expect(md.data).not.toContain('level:');
  });

  it('zips a README, content.json and the posts; past the limit it drops the revision history', async () => {
    const files = unzip((await exportZip(fakeDb(content()).client, { now })).body);
    expect([...files.keys()]).toEqual(['README.md', 'content.json', 'posts/math/am-gm.md', 'posts/life/why.md']);

    const small = await exportZip(fakeDb(content()).client, { now, maxBytes: 1 });
    expect(small.omitted).toEqual(['post_revisions']);
    expect(small.counts.post_revisions).toBe(0);
    expect(small.filename).toBe('codingspace-export-2026-10-17.zip');
    expect(unzip(small.body).get('README.md')).toContain('Left out to keep this download small enough: post_revisions');
  });
});

describe('restore (NFR-REL-2)', () => {
  const data = () => ({ format: 1 as const, exported_at: now.toISOString(), tables: content() });
  const empty = () => fakeDb({ subjects: [{ id: 'math' }] });

  it('reads an export .zip or its content.json, and refuses anything else', () => {
    const zipped = zip(exportEntries(data() as never));
    expect(readExport(zipped).tables.posts).toHaveLength(2);
    expect(readExport(Buffer.from(JSON.stringify(data()))).format).toBe(1);
    expect(() => readExport(zip([{ path: 'x.txt', data: 'x' }]))).toThrow('no content.json');
    expect(() => readExport(Buffer.from('{"format":2,"tables":{}}'))).toThrow(RestoreError);
  });

  it('writes every table in order: upserts by key, revisions as new rows without their ids', async () => {
    const { client, writes } = empty();
    const restored = await restoreContent(client, data() as never);
    expect(writes.map((w) => w.table)).toEqual(EXPORT_TABLES.map((t) => t.name));
    const revisions = writes.find((w) => w.table === 'post_revisions')!;
    expect(revisions.op).toBe('insert');
    expect(revisions.rows[0]).not.toHaveProperty('id');
    expect(writes.find((w) => w.table === 'post_media')).toMatchObject({
      op: 'upsert',
      onConflict: 'post_id,media_id',
    });
    expect(restored.posts).toBe(2);
  });

  it('writes in batches of 200', async () => {
    const { client, writes } = empty();
    const posts = Array.from({ length: 450 }, (_, i) => ({ id: `p${i}` }));
    await restoreContent(client, { ...data(), tables: { ...content(), posts } } as never);
    expect(writes.filter((w) => w.table === 'posts').map((w) => w.rows.length)).toEqual([200, 200, 50]);
  });

  it('puts the timeline of an older export (its own table then) into the Timeline section', async () => {
    const tables: Record<string, unknown> = {
      ...content(),
      timeline_items: [{ id: 't1', year: 2018, text: 'Started teaching', sort: 1 }],
    };
    delete tables.author_sections;
    delete tables.author_items;
    const { client, writes } = empty();
    await restoreContent(client, { ...data(), tables } as never);
    expect(writes.find((w) => w.table === 'author_items')?.rows).toEqual([
      { section_id: 'timeline', title: 'Started teaching', period: '2018', sort: 1 },
    ]);
    expect(writes.some((w) => (w.table as string) === 'timeline_items')).toBe(false);
  });

  it('refuses a database with content, and passes write errors on', async () => {
    await expect(restoreContent(fakeDb(content()).client, data() as never)).rejects.toThrow('already has posts');
    await expect(restoreContent(fakeDb({}, { fail: { posts: 'gone' } }).client, data() as never)).rejects.toThrow(
      'posts: gone',
    );
    const failing = fakeDb({}, { fail: { media: 'full' } });
    await expect(restoreContent(failing.client, data() as never)).rejects.toThrow('media: full');
  });
});
