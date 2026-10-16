import type { NextApiRequest, NextApiResponse } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import handler from '@/pages/api/cron/publish-due';
import { previewPost } from '@/server/admin/preview';
import { createPost, publishPost, saveDraft, schedulePost } from '@/server/admin/posts';
import { ownerSession, serviceClient } from '../support/admin-users';

// Preview (ADM-08) and the scheduled-publish endpoint (03 §6.1) against the local database.

const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
let owner: SupabaseClient;
let service: SupabaseClient;
let sectionId: string;

beforeAll(async () => {
  owner = await ownerSession();
  service = serviceClient();
  await service.from('posts').delete().like('slug', 'it-pub-%');
  const { data, error } = await service
    .from('sections')
    .upsert(
      { subject_id: 'physics', slug: 'it-pub-section', title: 'IT publish section', sort: 98 },
      { onConflict: 'subject_id,slug' },
    )
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  sectionId = data.id;
});

afterAll(async () => {
  await service.from('posts').delete().like('slug', 'it-pub-%');
  await service.from('sections').delete().eq('slug', 'it-pub-section');
  delete process.env.CRON_SECRET;
});

describe('preview', () => {
  it('shows the draft, not the live version, in its place among the section’s lessons', async () => {
    const first = await createPost(owner, {
      kind: 'lesson',
      title: 'IT pub: first',
      subject_id: 'physics',
      section_id: sectionId,
    });
    await saveDraft(owner, first.id, 1, { content_json: doc('first body') });
    await publishPost(owner, first.id, 2);

    const draft = await createPost(owner, {
      kind: 'lesson',
      title: 'IT pub: second',
      subject_id: 'physics',
      section_id: sectionId,
    });
    await service.from('posts').update({ sort: 5 }).eq('id', draft.id);
    await saveDraft(owner, draft.id, 1, { content_json: doc('draft body $x$') });

    const data = await previewPost(owner, draft.id);
    expect(data.post).toMatchObject({ title: 'IT pub: second', subject: 'physics' });
    expect(data.post.html).toContain('draft body');
    expect(data.section).toEqual({ slug: 'it-pub-section', title: 'IT publish section' });
    expect(data.siblings.map((s) => s.slug)).toEqual(['it-pub-first', 'it-pub-second']);

    // Edit the live one: the preview shows the edit, students still see the old text.
    await saveDraft(owner, first.id, 2, { title: 'IT pub: first, edited', content_json: doc('edited body') });
    const edited = await previewPost(owner, first.id);
    expect(edited.post.html).toContain('edited body');
    const { data: live } = await service.from('public_posts').select('html').eq('slug', 'it-pub-first').single();
    expect(live!.html).toContain('first body');
  });
});

function call(headers: Record<string, string> = {}) {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    revalidated: [] as string[],
    setHeader() {
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    async revalidate(path: string) {
      this.revalidated.push(path);
    },
  };
  return Promise.resolve(
    handler({ method: 'GET', headers } as unknown as NextApiRequest, res as unknown as NextApiResponse),
  ).then(() => res);
}

describe('the scheduled-publish endpoint', () => {
  const SECRET = 'integration-test-secret-'.padEnd(40, 'x');

  it('is closed until CRON_SECRET is set, and refuses a wrong secret', async () => {
    delete process.env.CRON_SECRET;
    expect((await call({ authorization: `Bearer ${SECRET}` })).statusCode).toBe(503);
    process.env.CRON_SECRET = SECRET;
    expect((await call()).statusCode).toBe(401);
    expect((await call({ authorization: 'Bearer wrong' })).statusCode).toBe(401);
  });

  it('publishes posts whose time has come and rebuilds their pages', async () => {
    process.env.CRON_SECRET = SECRET;
    const post = await createPost(owner, {
      kind: 'lesson',
      title: 'IT pub: scheduled',
      subject_id: 'physics',
      section_id: sectionId,
    });
    await saveDraft(owner, post.id, 1, { content_json: doc('scheduled body') });
    await schedulePost(owner, post.id, 2, new Date(Date.now() + 3600_000));

    const early = await call({ authorization: `Bearer ${SECRET}` });
    expect(early.statusCode).toBe(200);
    expect((early.body as { published: string[] }).published).not.toContain('it-pub-scheduled');

    // The time comes (moved into the past rather than waiting an hour).
    await service
      .from('posts')
      .update({ scheduled_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', post.id);
    const due = await call({ authorization: `Bearer ${SECRET}` });
    expect(due.body).toMatchObject({ published: ['it-pub-scheduled'], failed: [], notRefreshed: [] });
    expect(due.revalidated).toEqual(expect.arrayContaining(['/posts/it-pub-scheduled', '/', '/study/physics']));
    const { data } = await service.from('public_posts').select('html').eq('slug', 'it-pub-scheduled').single();
    expect(data!.html).toContain('scheduled body');
  });
});
