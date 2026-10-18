import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/server/admin/errors';
import {
  createPost,
  deletePost,
  getPostForEdit,
  listRevisions,
  publishDuePosts,
  publishPost,
  restoreRevision,
  revisionPreview,
  saveDraft,
  savePost,
  schedulePost,
  unpublishPost,
} from '@/server/admin/posts';
import { dashboard, listPosts } from '@/server/admin/list';
import {
  createSection,
  deleteSection,
  listStructure,
  reorderLessons,
  reorderSections,
  updateSection,
} from '@/server/admin/sections';
import { ownerSession, serviceClient } from '../support/admin-users';

// The write side against a real database (03 ADM-03, ADM-05…09): every change commits
// together with its revision and audit row, and students only ever see the live snapshot.

const { API_URL, ANON_KEY } = process.env;
const anon = createClient(API_URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

let owner: SupabaseClient;
let service: SupabaseClient;
let sectionId: string;

async function auditCount(postId: string) {
  const { count } = await service
    .from('audit_events')
    .select('*', { count: 'exact', head: true })
    .eq('entity_id', postId);
  return count ?? 0;
}
async function live(slug: string) {
  const { data } = await anon.from('public_posts').select('title, html, level').eq('slug', slug).maybeSingle();
  return data;
}

beforeAll(async () => {
  owner = await ownerSession();
  service = serviceClient();
  await service.from('posts').delete().like('slug', 'it-test-%');
  const { data, error } = await service
    .from('sections')
    .upsert(
      { subject_id: 'math', slug: 'it-test-section', title: 'Integration test section', sort: 99 },
      {
        onConflict: 'subject_id,slug',
      },
    )
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  sectionId = data.id;
});

afterAll(async () => {
  await service.from('posts').delete().like('slug', 'it-test-%');
  await service.from('posts').delete().like('title', 'IT test%');
  await service.from('sections').delete().eq('slug', 'it-test-section');
});

describe('writing and publishing a lesson', () => {
  let id = '';

  it('creates a draft with a slug from its title; a taken slug gets -2', async () => {
    const first = await createPost(owner, {
      kind: 'lesson',
      title: 'IT test: AM–GM',
      subject_id: 'math',
      section_id: sectionId,
    });
    const second = await createPost(owner, { kind: 'lesson', title: 'IT test: AM–GM', subject_id: 'math' });
    expect(first.slug).toBe('it-test-am-gm');
    expect(second.slug).toBe('it-test-am-gm-2');
    id = first.id;
    expect(await live('it-test-am-gm')).toBeNull();
  });

  it('saves the draft, refuses a stale save, and rejects unknown fields before the database', async () => {
    expect(await savePost(owner, id, 1, { content_json: doc('Version one'), level: 2 })).toBe(2);
    await expect(savePost(owner, id, 1, { title: 'old tab' })).rejects.toMatchObject({ status: 409 });
    await expect(savePost(owner, id, 2, { status: 'published' })).rejects.toBeInstanceOf(ApiError);
  });

  it('publishes: live snapshot, a revision and an audit row, and the pages to revalidate', async () => {
    const before = await auditCount(id);
    const result = await publishPost(owner, id, 2);
    expect(result).toMatchObject({ slug: 'it-test-am-gm', subject: 'math', was_published: false });
    expect(result.paths).toEqual(['/posts/it-test-am-gm', '/', '/study/math']);
    expect(await live('it-test-am-gm')).toMatchObject({ title: 'IT test: AM–GM', level: 2 });
    expect((await live('it-test-am-gm'))!.html).toContain('Version one');
    expect(await auditCount(id)).toBe(before + 1);
    const { data: revisions } = await owner.from('post_revisions').select('reason').eq('post_id', id);
    expect(revisions!.map((r) => r.reason)).toContain('publish');
  });

  it('edits stay in the draft until Update', async () => {
    expect(await savePost(owner, id, 2, { content_json: doc('Version two'), level: 3 })).toBe(3);
    const { data } = await owner.from('admin_posts').select('has_unpublished_changes').eq('id', id).single();
    expect(data!.has_unpublished_changes).toBe(true);
    expect(await live('it-test-am-gm')).toMatchObject({ level: 2 });

    expect((await publishPost(owner, id, 3)).was_published).toBe(true);
    expect((await live('it-test-am-gm'))!.html).toContain('Version two');
  });

  it('a refused publish changes nothing: no live change, no revision, no audit row', async () => {
    const before = await auditCount(id);
    const { count: revisionsBefore } = await owner
      .from('post_revisions')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', id);
    await expect(publishPost(owner, id, 2)).rejects.toMatchObject({ status: 409 });
    expect(await auditCount(id)).toBe(before);
    const { count: revisionsAfter } = await owner
      .from('post_revisions')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', id);
    expect(revisionsAfter).toBe(revisionsBefore);
  });

  it('restores an older revision into the draft', async () => {
    const { data } = await owner.from('post_revisions').select('id').eq('post_id', id).order('id').limit(1).single();
    expect(await restoreRevision(owner, id, 3, data!.id)).toBe(4);
  });

  it('unpublishes: students no longer see it', async () => {
    const result = await unpublishPost(owner, id);
    expect(result.paths).toContain('/posts/it-test-am-gm');
    expect(await live('it-test-am-gm')).toBeNull();
  });

  it('schedules, and the cron publishes it when due', async () => {
    await schedulePost(owner, id, 4, new Date(Date.now() + 60 * 60_000));
    expect((await publishDuePosts(service)).published.map((p) => p.slug)).not.toContain('it-test-am-gm');

    const later = new Date(Date.now() + 2 * 60 * 60_000);
    const { published, failed } = await publishDuePosts(service, later);
    expect(failed).toEqual([]);
    expect(published.map((p) => p.slug)).toContain('it-test-am-gm');
    expect(await live('it-test-am-gm')).not.toBeNull();
    const { data: audit } = await service
      .from('audit_events')
      .select('action, meta')
      .eq('entity_id', id)
      .order('id', { ascending: false })
      .limit(1)
      .single();
    expect(audit).toMatchObject({ action: 'post.publish', meta: { via: 'service' } });
  });

  it('deletes, returning the pages to refresh', async () => {
    const result = await deletePost(owner, id);
    expect(result.paths).toContain('/study/math');
    expect(await live('it-test-am-gm')).toBeNull();
  });

  it('visitors cannot call any of it', async () => {
    const { error } = await anon.rpc('admin_save_post', { p_id: id, p_revision: 1, p_fields: {} });
    expect(error?.code).toBe('42501');
  });
});

describe('the posts list and dashboard', () => {
  beforeAll(async () => {
    const a = await createPost(owner, {
      kind: 'lesson',
      title: 'IT test list: Cauchy',
      subject_id: 'math',
      section_id: sectionId,
    });
    await createPost(owner, { kind: 'life', title: 'IT test list: holidays' });
    await savePost(owner, a.id, 1, { content_json: doc('x') });
    await publishPost(owner, a.id, 2);
  });

  it('filters by search text, type, subject and status', async () => {
    const titles = async (f: Parameters<typeof listPosts>[1]) => (await listPosts(owner, f)).map((p) => p.title);
    expect(await titles({ q: 'it test list' })).toEqual(
      expect.arrayContaining(['IT test list: Cauchy', 'IT test list: holidays']),
    );
    expect(await titles({ q: 'IT test list', kind: 'life' })).toEqual(['IT test list: holidays']);
    expect(await titles({ q: 'IT test list', subject: 'math', status: 'published' })).toEqual(['IT test list: Cauchy']);
    expect(await titles({ q: 'it-test-list-cauchy' })).toEqual(['IT test list: Cauchy']);
    expect(await titles({ q: 'IT test list', status: 'changes' })).toEqual([]);
    // Filter syntax in the search box is just text.
    expect(await titles({ q: 'x),status.eq.draft,(title.ilike.*' })).toEqual([]);
  });

  it('counts posts for the dashboard and lists the latest edits', async () => {
    const d = await dashboard(owner);
    expect(d.counts.published).toBeGreaterThanOrEqual(1);
    expect(d.counts.life).toBeGreaterThanOrEqual(1);
    // Counted by the database: the same numbers as counting every post here.
    const { data: all } = await owner.from('admin_posts').select('kind, status');
    const rows = all as { kind: string; status: string }[];
    expect(d.counts).toEqual({
      published: rows.filter((r) => r.status === 'published').length,
      scheduled: rows.filter((r) => r.status === 'scheduled').length,
      drafts: rows.filter((r) => r.status !== 'published' && r.status !== 'scheduled').length,
      life: rows.filter((r) => r.kind === 'life').length,
    });
    expect(d.recent.length).toBeLessThanOrEqual(5);
    expect(d.recent[0]!.title).toMatch(/^IT test list/);
  });

  it('shows nothing to a visitor', async () => {
    const { data } = await anon.from('admin_posts').select('id');
    expect(data ?? []).toEqual([]);
  });
});

describe('editing a draft (the editor’s save)', () => {
  it('the URL follows the title until first publish, avoiding taken ones; then it is fixed', async () => {
    const { id, slug } = await createPost(owner, { kind: 'lesson', subject_id: 'math', section_id: sectionId });
    expect(slug).toMatch(/^lesson-\d{4}-\d{2}-\d{2}(-\d+)?$/);

    let saved = await saveDraft(owner, id, 1, { title: 'IT test edit: Vieta' });
    expect(saved).toEqual({ revision: 2, slug: 'it-test-edit-vieta' });

    // Same title again: keeps its slug, doesn't become -2.
    saved = await saveDraft(owner, id, 2, { title: 'IT test edit: Vieta' });
    expect(saved.slug).toBe('it-test-edit-vieta');

    // Another post takes the next title first: this one gets -2.
    await createPost(owner, { kind: 'lesson', title: 'IT test edit: Vieta jumping', subject_id: 'math' });
    saved = await saveDraft(owner, id, 3, { title: 'IT test edit: Vieta jumping' });
    expect(saved.slug).toBe('it-test-edit-vieta-jumping-2');

    // A Khmer title has no Latin letters: the URL stays as it was.
    saved = await saveDraft(owner, id, 4, { title: 'វិសមភាព' });
    expect(saved.slug).toBe('it-test-edit-vieta-jumping-2');

    await saveDraft(owner, id, 5, { title: 'IT test edit: Vieta', content_json: doc('x') });
    await publishPost(owner, id, 6);
    saved = await saveDraft(owner, id, 6, { title: 'IT test edit: renamed after publishing' });
    expect(saved.slug).toBe('it-test-edit-vieta');
  });

  it('the client cannot set the slug, and the body is stored in canonical form', async () => {
    const { id } = await createPost(owner, { kind: 'life', title: 'IT test edit: canonical' });
    const saved = await saveDraft(owner, id, 1, {
      slug: 'hijacked',
      content_json: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'a', marks: [{ type: 'link', attrs: { href: 'https://x.io', target: '_blank' } }] },
            ],
          },
        ],
      },
    });
    expect(saved.slug).toBe('it-test-edit-canonical');
    const { post, sections } = await getPostForEdit(owner, id);
    expect(post.content_json).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'a', marks: [{ type: 'link', attrs: { href: 'https://x.io' } }] }],
        },
      ],
    });
    expect(post).toMatchObject({ kind: 'life', revision: 2, has_unpublished_changes: false });
    expect(sections.length).toBeGreaterThan(0);
  });

  it('a missing post is 404', async () => {
    await expect(getPostForEdit(owner, '00000000-0000-4000-8000-00000000dead')).rejects.toMatchObject({ status: 404 });
  });
});

describe('revision history', () => {
  it('lists versions newest first, previews one as students would see it, and a restore can be undone', async () => {
    const { id } = await createPost(owner, { kind: 'life', title: 'IT test history' });
    await saveDraft(owner, id, 1, { content_json: doc('First body') });
    await saveDraft(owner, id, 2, { title: 'IT test history, edited', content_json: doc('Latest body') });

    const [first] = await listRevisions(owner, id);
    expect(first).toMatchObject({ reason: 'autosave', title: 'IT test history' });
    const preview = await revisionPreview(owner, id, first!.id);
    expect(preview.html).toContain('First body');

    expect(await restoreRevision(owner, id, 3, first!.id)).toBe(4);
    const after = await listRevisions(owner, id);
    expect(after.map((r) => r.reason)).toEqual(['restore', 'before_restore', 'autosave']);
    const undo = after.find((r) => r.reason === 'before_restore')!;
    expect((await revisionPreview(owner, id, undo.id)).html).toContain('Latest body');
  });

  it('a revision of another post, or a bad id, is not found', async () => {
    const a = await createPost(owner, { kind: 'life', title: 'IT test history A' });
    const b = await createPost(owner, { kind: 'life', title: 'IT test history B' });
    await saveDraft(owner, a.id, 1, { content_json: doc('A') });
    const [revA] = await listRevisions(owner, a.id);
    await expect(revisionPreview(owner, b.id, revA!.id)).rejects.toMatchObject({ status: 404 });
    await expect(revisionPreview(owner, b.id, 'x')).rejects.toThrow();
  });

  it('visitors cannot read revisions', async () => {
    const { data } = await anon.from('post_revisions').select('id');
    expect(data ?? []).toEqual([]);
  });
});

describe('a new lesson in an existing section', () => {
  it('goes to the end of the section, and publishing rebuilds the other lessons’ pages too', async () => {
    const first = await createPost(owner, {
      kind: 'lesson',
      title: 'IT test order: first',
      subject_id: 'math',
      section_id: sectionId,
    });
    await saveDraft(owner, first.id, 1, { content_json: doc('1') });
    await publishPost(owner, first.id, 2);

    const second = await createPost(owner, {
      kind: 'lesson',
      title: 'IT test order: second',
      subject_id: 'math',
      section_id: sectionId,
    });
    await saveDraft(owner, second.id, 1, { content_json: doc('2') });
    const result = await publishPost(owner, second.id, 2);

    const { data } = await anon
      .from('public_posts')
      .select('slug')
      .eq('section_id', sectionId)
      .order('sort')
      .order('slug');
    const order = data!.map((r) => r.slug);
    expect(order.indexOf('it-test-order-second')).toBeGreaterThan(order.indexOf('it-test-order-first'));
    expect(result.paths).toContain('/posts/it-test-order-first');

    const off = await unpublishPost(owner, second.id);
    expect(off.paths).toContain('/posts/it-test-order-first');
  });
});

describe('adding a section', () => {
  afterAll(async () => {
    await service.from('sections').delete().like('slug', 'it-test-new%');
    await service.from('sections').delete().like('title', 'វិ%');
  });

  it('goes last in its subject, with a free address from its title', async () => {
    const a = await createSection(owner, { subject_id: 'coding', title: 'IT test new: Recursion' });
    const b = await createSection(owner, { subject_id: 'coding', title: 'IT test new: Recursion' });
    expect(a.slug).toBe('it-test-new-recursion');
    expect(b.slug).toBe('it-test-new-recursion-2');
    expect(b.sort).toBeGreaterThan(a.sort);
    const khmer = await createSection(owner, { subject_id: 'coding', title: 'វិសមភាព' });
    expect(khmer.slug).toMatch(/^section-\d+$/);
    await expect(createSection(owner, { subject_id: 'coding', title: '  ' })).rejects.toMatchObject({ status: 422 });
    await expect(createSection(owner, { subject_id: 'art', title: 'X' })).rejects.toMatchObject({ status: 422 });
  });

  it('visitors cannot add sections', async () => {
    const { error } = await anon.rpc('admin_create_section', {
      p_subject_id: 'math',
      p_title: 'x',
      p_slug: 'x',
      p_description: '',
    });
    expect(error?.code).toBe('42501');
  });
});

describe('study structure', () => {
  it('rename, reorder sections and lessons, delete an empty one and one with lessons; each returns the pages to rebuild', async () => {
    const a = await createSection(owner, { subject_id: 'it', title: 'IT test struct A' });
    const b = await createSection(owner, { subject_id: 'it', title: 'IT test struct B' });
    const one = await createPost(owner, {
      kind: 'lesson',
      title: 'IT test struct: one',
      subject_id: 'it',
      section_id: a.id,
    });
    const two = await createPost(owner, {
      kind: 'lesson',
      title: 'IT test struct: two',
      subject_id: 'it',
      section_id: a.id,
    });
    await saveDraft(owner, one.id, 1, { content_json: doc('1') });
    await publishPost(owner, one.id, 2);

    const renamed = await updateSection(owner, a.id, { title: 'IT test struct A, renamed', description: 'about A' });
    expect(renamed.paths).toEqual(['/study/it', '/posts/it-test-struct-one']);

    let structure = await listStructure(owner, 'it');
    const ids = structure.map((s) => s.id);
    const reordered = [...ids.filter((x) => x !== b.id), b.id].reverse();
    await reorderSections(owner, { subject_id: 'it', ids: reordered });
    structure = await listStructure(owner, 'it');
    expect(structure.map((s) => s.id)).toEqual(reordered);
    const sectionA = structure.find((s) => s.id === a.id)!;
    expect(sectionA).toMatchObject({ title: 'IT test struct A, renamed', description: 'about A' });
    expect(sectionA.lessons.map((l) => l.title)).toEqual(['IT test struct: one', 'IT test struct: two']);

    const lessons = await reorderLessons(owner, a.id, { ids: [two.id, one.id] });
    expect(lessons.paths).toContain('/posts/it-test-struct-one');
    expect((await listStructure(owner, 'it')).find((s) => s.id === a.id)!.lessons.map((l) => l.title)).toEqual([
      'IT test struct: two',
      'IT test struct: one',
    ]);

    expect((await deleteSection(owner, b.id)).paths).toEqual(['/study/it']);
    // Listing a section twice (or leaving one out) is refused.
    await expect(reorderSections(owner, { subject_id: 'it', ids: [a.id, a.id] })).rejects.toMatchObject({
      status: 422,
    });
    await expect(updateSection(owner, a.id, { title: ' ' })).rejects.toMatchObject({ status: 422 });

    // Deleting a section deletes its lessons; the live ones' pages are rebuilt (now 404).
    const gone = await deleteSection(owner, a.id);
    expect(gone.deleted).toBe(2);
    expect(gone.paths).toEqual(expect.arrayContaining(['/study/it', '/', '/posts/it-test-struct-one']));
    const { data: left } = await service.from('posts').select('id').in('id', [one.id, two.id]);
    expect(left).toEqual([]);
  });
});
