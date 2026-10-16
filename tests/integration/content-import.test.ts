import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { importContent } from '@/server/content/import';
import { loadContent } from '@/server/content/load';
import { supabaseStore } from '@/server/content/supabase-store';

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY } = process.env;
if (!API_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error('Run with a local Supabase: eval "$(npx supabase status -o env)" first (see package.json test:int).');
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(API_URL, SERVICE_ROLE_KEY, options);
const anon = createClient(API_URL, ANON_KEY, options);
const content = loadContent(join(__dirname, '../../content'));

describe('content import into a real database', () => {
  beforeAll(async () => {
    // Start from no posts, so publish dates don't depend on which integration file ran first.
    const { error } = await admin.from('posts').delete().not('id', 'is', null);
    if (error) throw new Error(error.message);
    // Twice: the second run must update in place, not duplicate or fail on constraints.
    await importContent(content, supabaseStore(admin), new Date('2026-10-16T08:00:00Z'));
    await importContent(content, supabaseStore(admin), new Date('2026-10-20T08:00:00Z'));
  });

  it('publishes every post, readable by visitors through public_posts', async () => {
    const { data, error } = await anon.from('public_posts').select('slug, kind, published_at, updated_at');
    expect(error).toBeNull();
    expect(data).toHaveLength(11);
    const amgm = data!.find((p) => p.slug === 'am-gm-inequality')!;
    expect(new Date(amgm.published_at).toISOString()).toBe('2026-10-16T08:00:00.000Z');
    expect(new Date(amgm.updated_at).toISOString()).toBe('2026-10-20T08:00:00.000Z');
  });

  it('serves rendered HTML and metadata', async () => {
    const { data } = await anon
      .from('public_posts')
      .select('title, html, toc, has_math, level, problem_count')
      .eq('slug', 'am-gm-inequality')
      .single();
    expect(data).toMatchObject({ title: 'The AM–GM inequality', has_math: true, level: 1, problem_count: 3 });
    expect(data!.html).toContain('class="katex"');
    expect(data!.toc).toContainEqual({ id: 'proof', text: 'Proof', level: 2 });
  });

  it('counts published lessons per section', async () => {
    const { data } = await anon
      .from('public_sections')
      .select('slug, lesson_count')
      .eq('subject_id', 'math')
      .order('sort');
    expect(data?.slice(0, 2)).toEqual([
      { slug: 'inequalities', lesson_count: 2 },
      { slug: 'sequences', lesson_count: 0 },
    ]);
  });

  it('finds posts with full-text search, including Khmer', async () => {
    const search = async (q: string) =>
      (await anon.from('public_posts').select('slug').textSearch('search', q, { config: 'simple' })).data?.map(
        (p) => p.slug,
      );
    expect(await search('cauchy')).toEqual(['cauchy-schwarz-inequality']);
    expect(await search('គន្លឹះសិក្សាសម្រាប់សិស្ស')).toEqual(['study-tips-km']);
  });

  it('search (PUB-09): title matches first, prefixes, Khmer inside words, drafts never', async () => {
    const search = async (q: string) =>
      ((await anon.rpc('search_posts', { p_q: q })).data as { slug: string; snippet: string }[]).map((r) => r.slug);
    expect((await search('cauchy'))[0]).toBe('cauchy-schwarz-inequality');
    expect(await search('ineq')).toEqual(expect.arrayContaining(['am-gm-inequality', 'cauchy-schwarz-inequality']));
    expect(await search('សិក្សា')).toContain('study-tips-km');
    expect(await search('zzzz-no-such-word')).toEqual([]);
  });

  it('serves projects, profile, timeline and the current problem', async () => {
    expect((await anon.from('public_projects').select('slug')).data).toHaveLength(3);
    expect((await anon.from('public_profile').select('name').single()).data).toEqual({ name: 'CodingSpace' });
    expect((await anon.from('public_timeline').select('year')).data).toHaveLength(4);
    expect((await anon.from('public_featured_problems').select('subject_id')).data).toEqual([{ subject_id: 'math' }]);
  });

  it('does not let visitors see drafts or write', async () => {
    const { error: draftErr } = await anon.from('posts').select('content_json').limit(1);
    expect(draftErr?.code).toBe('42501');
    const { error: writeErr } = await anon.from('projects').insert({
      slug: 'x',
      name: 'x',
      description: 'x',
      landing_url: 'https://example.com',
    });
    expect(writeErr?.code).toBe('42501');
  });
});
