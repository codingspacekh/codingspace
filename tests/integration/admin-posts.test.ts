import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  createPost,
  deletePost,
  PostError,
  publishDuePosts,
  publishPost,
  restoreRevision,
  savePost,
  schedulePost,
  unpublishPost,
} from '@/server/admin/posts';
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
    await expect(savePost(owner, id, 2, { status: 'published' })).rejects.toBeInstanceOf(PostError);
  });

  it('publishes: live snapshot, a revision and an audit row, and the pages to revalidate', async () => {
    const before = await auditCount(id);
    const result = await publishPost(owner, id, 2);
    expect(result).toMatchObject({ slug: 'it-test-am-gm', subject: 'math', was_published: false });
    expect(result.paths).toEqual(['/posts/it-test-am-gm', '/', '/study/math', '/sitemap.xml', '/rss.xml']);
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
