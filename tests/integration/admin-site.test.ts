import type { SupabaseClient } from '@supabase/supabase-js';
import { PostError } from '@/server/admin/posts';
import {
  deleteProblem,
  deleteProject,
  featureProject,
  getAuthor,
  listProblems,
  listProjects,
  previewProblem,
  reorderProjects,
  saveAuthor,
  saveProblem,
  saveProject,
  setCurrentProblem,
} from '@/server/admin/site';
import { ownerSession, serviceClient } from '../support/admin-users';

// Site content against a real database (03 ADM-11, ADM-13, ADM-14). The tables hold the
// imported content other tests read, so it is saved first and put back afterwards.

const TABLES = ['projects', 'profile', 'timeline_items', 'featured_problems'] as const;
let owner: SupabaseClient;
let service: SupabaseClient;
const saved: Record<string, unknown[]> = {};

beforeAll(async () => {
  owner = await ownerSession();
  service = serviceClient();
  for (const t of TABLES) saved[t] = (await service.from(t).select('*')).data ?? [];
});
afterAll(async () => {
  for (const t of TABLES) {
    await service
      .from(t)
      .delete()
      .not(t === 'profile' ? 'id' : 'id', 'is', null);
    if (saved[t]!.length) await service.from(t).insert(saved[t]!);
  }
});

const project = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  description: `${name} does things.`,
  landing_url: 'https://example.com/app',
  ...extra,
});

describe('projects (ADM-13)', () => {
  it('adds projects last with a slug from the name, and rebuilds Home and Projects', async () => {
    const a = await saveProject(owner, null, project('IT Test Quiz', { platforms: ['Web', 'Android'] }));
    const b = await saveProject(owner, null, project('IT Test Quiz'));
    expect(a.paths).toEqual(['/', '/projects']);
    const list = await listProjects(owner);
    const mine = list.filter((p) => p.name === 'IT Test Quiz');
    expect(mine.map((p) => p.slug)).toEqual(['it-test-quiz', 'it-test-quiz-2']);
    expect(mine.map((p) => p.id)).toEqual([a.id, b.id]);
    expect(list.at(-1)!.id).toBe(b.id);
    await deleteProject(owner, b.id);
  });

  it('refuses a landing page that is not https, saying why', async () => {
    for (const url of ['http://example.com', 'javascript:alert(1)', 'https://u:p@example.com']) {
      await expect(saveProject(owner, null, project('IT Test Bad', { landing_url: url }))).rejects.toMatchObject({
        status: 422,
      });
    }
  });

  it('features one project at a time, reorders and deletes', async () => {
    const { id } = await saveProject(owner, null, project('IT Test Sim'));
    await featureProject(owner, id);
    let list = await listProjects(owner);
    expect(list.filter((p) => p.is_featured).map((p) => p.id)).toEqual([id]);

    const ids = list.map((p) => p.id);
    await reorderProjects(owner, { ids: [id, ...ids.filter((x) => x !== id)] });
    list = await listProjects(owner);
    expect(list[0]!.id).toBe(id);
    expect(list.map((p) => p.sort)).toEqual(list.map((_, i) => i + 1));

    await saveProject(owner, id, project('IT Test Sim 2', { tag: 'Physics', subject_id: 'physics' }));
    expect((await listProjects(owner))[0]).toMatchObject({ name: 'IT Test Sim 2', tag: 'Physics', is_featured: true });
    await featureProject(owner, null);
    expect((await listProjects(owner)).some((p) => p.is_featured)).toBe(false);
    await deleteProject(owner, id);
    await expect(deleteProject(owner, id)).rejects.toMatchObject({ status: 404 });
    for (const p of await listProjects(owner)) if (p.name.startsWith('IT Test')) await deleteProject(owner, p.id);
  });
});

describe('author (ADM-14)', () => {
  it('saves the profile and the whole timeline in order', async () => {
    const out = await saveAuthor(owner, {
      profile: { name: 'IT Teacher', bio: 'Bio.', years: 9, students: 600, email: 'me@example.com' },
      timeline: [
        { year: 2020, text: 'First' },
        { year: 2019, text: 'Second, though earlier' },
      ],
    });
    expect(out.paths).toEqual(['/author']);
    expect(await getAuthor(owner)).toEqual({
      profile: {
        name: 'IT Teacher',
        bio: 'Bio.',
        years: 9,
        students: 600,
        email: 'me@example.com',
        photo_media_id: null,
      },
      photo: null,
      timeline: [
        { year: 2020, text: 'First' },
        { year: 2019, text: 'Second, though earlier' },
      ],
    });
  });

  it('takes an image from the library as the photo, and refuses anything else', async () => {
    const image = '3f2b8c1e-9a4d-4c6b-8e2f-1a2b3c4d5e6f';
    await service
      .from('profile')
      .update({ photo_media_id: null, photo_widths: [], photo_width: null, photo_height: null })
      .eq('id', true);
    await service.from('media').delete().eq('id', image);
    await service.from('media').insert({
      id: image,
      kind: 'image',
      mime: 'image/jpeg',
      bytes: 10,
      sha256: 'f'.repeat(64),
      width: 600,
      height: 600,
      widths: [480, 600],
      original_name: 'it-photo.jpg',
    });
    const profile = { name: 'IT Teacher', photo_media_id: image };
    await saveAuthor(owner, { profile, timeline: [] });
    expect((await getAuthor(owner)).photo).toEqual({ id: image, widths: [480, 600] });
    const { data } = await service
      .from('public_profile')
      .select('photo, photo_widths, photo_width, photo_height')
      .single();
    expect(data).toEqual({ photo: image, photo_widths: [480, 600], photo_width: 600, photo_height: 600 });
    await expect(
      saveAuthor(owner, { profile: { ...profile, photo_media_id: 'not-a-uuid' }, timeline: [] }),
    ).rejects.toMatchObject({
      status: 422,
    });
    await saveAuthor(owner, { profile: { ...profile, photo_media_id: null }, timeline: [] });
    await service.from('media').delete().eq('id', image);
  });

  it('refuses a bad email or an empty name', async () => {
    await expect(saveAuthor(owner, { profile: { name: 'X', email: 'nope' }, timeline: [] })).rejects.toBeInstanceOf(
      PostError,
    );
    await expect(saveAuthor(owner, { profile: { name: ' ' }, timeline: [] })).rejects.toMatchObject({ status: 422 });
  });
});

describe('problem of the week (ADM-11)', () => {
  it('shows one problem per subject; changes rebuild Home and the subject page', async () => {
    const first = await saveProblem(owner, null, {
      subject_id: 'math',
      week_of: '2026-10-19',
      statement: 'IT test: prove $a^2 \\ge 0$.',
      hint: 'Square.',
    });
    expect(first.paths).toEqual(['/', '/study/math']);
    const second = await saveProblem(owner, null, {
      subject_id: 'math',
      week_of: '2026-10-26',
      statement: 'IT test 2',
    });
    await setCurrentProblem(owner, first.id, { current: true });
    await setCurrentProblem(owner, second.id, { current: true });
    const mine = (await listProblems(owner)).filter((p) => p.statement.startsWith('IT test'));
    expect(mine.map((p) => [p.week_of, p.is_current])).toEqual([
      ['2026-10-26', true],
      ['2026-10-19', false],
    ]);
    const anon = (await service.from('public_featured_problems').select('statement').eq('subject_id', 'math')).data;
    expect(anon).toEqual([{ statement: 'IT test 2' }]);

    expect((await deleteProblem(owner, first.id)).paths).toEqual([]); // it wasn't showing
    expect((await deleteProblem(owner, second.id)).paths).toEqual(['/', '/study/math']);
  });

  it('refuses a missing statement or a bad date', async () => {
    await expect(
      saveProblem(owner, null, { subject_id: 'math', week_of: '2026-10-19', statement: '' }),
    ).rejects.toMatchObject({
      status: 422,
    });
    await expect(
      saveProblem(owner, null, { subject_id: 'math', week_of: '19/10/2026', statement: 'x' }),
    ).rejects.toMatchObject({
      status: 422,
    });
  });

  it('previews with the lesson renderer: maths and escaped HTML', async () => {
    const out = await previewProblem({
      statement: 'Show $x^2 \\ge 0$. <script>alert(1)</script>',
      hint: '',
      solution: '',
    });
    expect(out.statement).toContain('class="katex"');
    expect(out.statement).not.toContain('<script>');
    expect(out.hint).toBe('');
  });
});
