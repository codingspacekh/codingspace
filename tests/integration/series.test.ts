import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createPost } from '@/server/admin/posts';
import { deleteSeries, listLessonChoices, listSeries, reorderSeries, saveSeries } from '@/server/admin/series';
import { getPostPage, getSeriesList, getSeriesPage } from '@/server/data/public';
import { PostError } from '@/server/admin/posts';
import { ownerSession, serviceClient } from '../support/admin-users';

// v1.1 lesson series against a real database (needs content:import's lessons): the owner
// builds a series across subjects; visitors see its published lessons in order, and each
// lesson's place in it.

const { API_URL, ANON_KEY } = process.env;
const anon = createClient(API_URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

let owner: SupabaseClient;
let service: SupabaseClient;
const made: string[] = [];

beforeAll(async () => {
  owner = await ownerSession();
  service = serviceClient();
  await service.from('posts').delete().like('slug', 'it-series-%');
});
afterAll(async () => {
  for (const id of made) await deleteSeries(owner, id).catch(() => {});
  await service.from('posts').delete().like('slug', 'it-series-%');
});

const lessonId = async (slug: string) => {
  const { data } = await service.from('posts').select('id').eq('slug', slug).single();
  return data!.id as string;
};

describe('lesson series', () => {
  it('a series across subjects: its page, the list, and each lesson’s place', async () => {
    const draft = await createPost(owner, { kind: 'lesson', title: 'IT series draft', subject_id: 'math' });
    const ids = [await lessonId('am-gm-inequality'), draft.id, await lessonId('projectile-motion')];
    const choices = await listLessonChoices(owner);
    expect(choices.find((c) => c.id === draft.id)).toMatchObject({ status: 'draft', subject_id: 'math' });

    const { id, paths } = await saveSeries(owner, null, {
      title: 'IT Maths for Physics',
      description: 'Tools first.',
      post_ids: ids,
    });
    made.push(id);
    expect(paths).toEqual([
      '/series',
      '/series/it-maths-for-physics',
      '/posts/am-gm-inequality',
      '/posts/projectile-motion',
    ]);
    expect((await listSeries(owner)).find((s) => s.id === id)?.post_ids).toEqual(ids);

    const page = await getSeriesPage('it-maths-for-physics');
    expect(page).toMatchObject({
      title: 'IT Maths for Physics',
      description: 'Tools first.',
      subjectIds: ['math', 'physics'],
    });
    expect(page!.lessons.map((l) => l.slug)).toEqual(['am-gm-inequality', 'projectile-motion']);
    expect((await getSeriesList()).find((s) => s.slug === 'it-maths-for-physics')).toMatchObject({
      lessonCount: 2,
      subjectIds: ['math', 'physics'],
    });

    const lesson = await getPostPage('projectile-motion');
    expect(lesson!.series).toContainEqual({
      slug: 'it-maths-for-physics',
      title: 'IT Maths for Physics',
      position: 2,
      total: 2,
      prev: { slug: 'am-gm-inequality', title: expect.any(String), subject: 'math' },
      next: null,
    });
  });

  it('a series with no live lessons is not shown; a second one gets its own address', async () => {
    const draft = await createPost(owner, { kind: 'lesson', title: 'IT series lonely', subject_id: 'it' });
    const { id } = await saveSeries(owner, null, { title: 'IT Maths for Physics', post_ids: [draft.id] });
    made.push(id);
    const slug = (await listSeries(owner)).find((s) => s.id === id)!.slug;
    expect(slug).toBe('it-maths-for-physics-2');
    expect(await getSeriesPage(slug)).toBeNull();
    expect((await getSeriesList()).some((s) => s.slug === slug)).toBe(false);
  });

  it('reorders, refuses bad input, and keeps changes to the owner', async () => {
    const all = (await listSeries(owner)).map((s) => s.id);
    await reorderSeries(owner, { ids: [...all].reverse() });
    expect((await listSeries(owner)).map((s) => s.id)).toEqual([...all].reverse());
    await expect(reorderSeries(owner, { ids: all.slice(1) })).rejects.toMatchObject({ status: 422 });
    await expect(saveSeries(owner, null, { title: '', post_ids: [] })).rejects.toBeInstanceOf(PostError);

    const { error } = await anon.rpc('admin_save_series', { p_id: null, p: { slug: 'x', title: 'x', post_ids: [] } });
    expect(error).not.toBeNull();
    const { data } = await anon.from('series_lessons').select('post_id');
    const drafts = (await listLessonChoices(owner)).filter((c) => c.status !== 'published').map((c) => c.id);
    expect((data ?? []).some((r) => drafts.includes(r.post_id))).toBe(false);
  });
});
