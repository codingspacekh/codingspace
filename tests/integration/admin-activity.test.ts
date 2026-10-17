import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createPost, deletePost, saveDraft } from '@/server/admin/posts';
import { listActivity } from '@/server/admin/activity';
import { ownerSession, serviceClient } from '../support/admin-users';

// 03 ADM-15 against a real database: the owner reads the audit log newest first, without
// autosaves, with each item's current name; nobody else can read it.

const { API_URL, ANON_KEY } = process.env;
const anon = createClient(API_URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

let owner: SupabaseClient;
let service: SupabaseClient;

beforeAll(async () => {
  owner = await ownerSession();
  service = serviceClient();
  await service.from('posts').delete().like('slug', 'it-activity-%');
});
afterAll(async () => {
  await service.from('posts').delete().like('slug', 'it-activity-%');
});

describe('the activity log', () => {
  it('lists changes newest first, leaves out autosaves and shows current names', async () => {
    const { id } = await createPost(owner, { kind: 'life', title: 'IT activity: first' });
    await saveDraft(owner, id, 1, { title: 'IT activity: renamed' });

    const { events } = await listActivity(owner, { limit: 10 });
    expect(events.some((e) => e.action === 'post.save')).toBe(false);
    const created = events.find((e) => e.action === 'post.create' && e.entity_id === id);
    expect(created?.name).toBe('IT activity: renamed');
    expect(events.map((e) => e.id)).toEqual([...events.map((e) => e.id)].sort((a, b) => b - a));
  });

  it('keeps the name in the event once the item is gone', async () => {
    const { id } = await createPost(owner, { kind: 'life', title: 'IT activity: gone' });
    await deletePost(owner, id);
    const { events } = await listActivity(owner, { limit: 5 });
    const deleted = events.find((e) => e.action === 'post.delete' && e.entity_id === id);
    expect(deleted).toMatchObject({ name: null, meta: { title: 'IT activity: gone', slug: 'it-activity-gone' } });
  });

  it('pages with `before`', async () => {
    const first = await listActivity(owner, { limit: 2 });
    expect(first.events).toHaveLength(2);
    expect(first.more).toBe(true);
    const next = await listActivity(owner, { limit: 2, before: first.events[1]!.id });
    expect(next.events[0]!.id).toBeLessThan(first.events[1]!.id);
  });

  it('is invisible to anyone but the owner', async () => {
    const { data } = await anon.from('audit_events').select('id').limit(1);
    expect(data ?? []).toEqual([]);
  });
});
