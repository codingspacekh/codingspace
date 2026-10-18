import { randomBytes, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getAnalytics } from '@/server/admin/analytics';
import { ownerSession } from '../support/admin-users';

// v1.1 owner analytics against a real database: visitors record views with the anon key,
// only the owner reads the dashboard, and nobody reads the raw views through the API.

const { API_URL, ANON_KEY } = process.env;
const anon = createClient(API_URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

let owner: SupabaseClient;
beforeAll(async () => {
  owner = await ownerSession();
});

const view = (client: string, path: string, source: string | null = null) =>
  anon.rpc('track_view', {
    p_id: randomUUID(),
    p_client: client,
    p_path: path,
    p_source: source,
    p_device: 'mobile',
    p_country: 'KH',
  });

describe('analytics', () => {
  it('a view and its reading time show on the owner’s dashboard', async () => {
    const before = await getAnalytics(owner, 7);
    const client = randomBytes(32).toString('hex');
    const id = randomUUID();
    const first = await anon.rpc('track_view', {
      p_id: id,
      p_client: client,
      p_path: '/projects',
      p_source: 'IT-analytics.example',
      p_device: 'tablet',
      p_country: 'KH',
    });
    expect(first).toMatchObject({ data: true, error: null });
    expect((await view(client, '/author')).data).toBe(true);
    expect((await anon.rpc('track_time', { p_id: id, p_seconds: 61 })).error).toBeNull();

    const after = await getAnalytics(owner, 7);
    const today = (a: typeof after) => a.days.at(-1)!;
    expect(today(after).views - today(before).views).toBe(2);
    expect(today(after).visitors - today(before).visitors).toBe(1);
    expect(today(after).seconds - today(before).seconds).toBe(61);
    expect(after.sources).toContainEqual({ source: 'IT-analytics.example', views: 1 });
    expect(after.devices.find((d) => d.device === 'tablet')!.views).toBeGreaterThanOrEqual(1);
  });

  it('refuses a bad view', async () => {
    expect((await view('not-a-hash', '/')).data).toBe(false);
    expect((await view(randomBytes(32).toString('hex'), '/admin/..')).data).toBe(false);
  });

  it('only the owner reads analytics', async () => {
    const { error } = await anon.rpc('admin_analytics', { p_days: 7 });
    expect(error).not.toBeNull();
  });
});
