import type { SupabaseClient } from '@supabase/supabase-js';
import { createPost, deletePost, publishPost, saveDraft } from '@/server/admin/posts';
import {
  deleteSyllabus,
  getPostSyllabus,
  listSyllabuses,
  saveSyllabus,
  saveSyllabusPoints,
  setPostSyllabus,
} from '@/server/admin/syllabus';
import { getPostPage, getSyllabusList, getSyllabusPage } from '@/server/data/public';
import { ownerSession, serviceClient } from '../support/admin-users';

// v1.1 syllabus tags against a real database (needs content:import's lessons): the owner builds
// a syllabus and tags lessons; visitors see the points with their published lessons only.

const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

let owner: SupabaseClient;
let service: SupabaseClient;
const made: string[] = [];

const lessonId = async (slug: string) => {
  const { data } = await service.from('posts').select('id').eq('slug', slug).single();
  return data!.id as string;
};

beforeAll(async () => {
  owner = await ownerSession();
  service = serviceClient();
  await service.from('syllabuses').delete().like('title', 'IT syllabus%');
  await service.from('posts').delete().like('slug', 'it-syllabus-%');
});
afterAll(async () => {
  for (const id of made) await deleteSyllabus(owner, id).catch(() => {});
  await service.from('posts').delete().like('slug', 'it-syllabus-%');
});

describe('syllabus tags', () => {
  it('a syllabus with points; tagged lessons show on its page and theirs, drafts never', async () => {
    const { id, paths } = await saveSyllabus(owner, null, { code: 'IT9', title: 'IT syllabus 9' });
    made.push(id);
    expect(paths).toEqual(['/syllabus', '/syllabus/it9']);
    await saveSyllabusPoints(owner, id, [
      { code: '1.1', title: 'Inequalities' },
      { code: '1.2', title: 'Kinematics' },
      { code: '1.3', title: 'Not taught yet' },
    ]);
    const [s] = (await listSyllabuses(owner)).filter((x) => x.id === id);
    const point = (code: string) => s!.points.find((p) => p.code === code)!.id;

    const amgm = await lessonId('am-gm-inequality');
    const tagged = await setPostSyllabus(owner, amgm, { point_ids: [point('1.1')] });
    expect(tagged.paths).toEqual(['/posts/am-gm-inequality', '/syllabus/it9']);
    await setPostSyllabus(owner, await lessonId('projectile-motion'), { point_ids: [point('1.2'), point('1.1')] });
    const draft = await createPost(owner, { kind: 'lesson', title: 'IT syllabus draft', subject_id: 'math' });
    expect((await setPostSyllabus(owner, draft.id, { point_ids: [point('1.3')] })).paths).toEqual([]);
    expect((await getPostSyllabus(owner, amgm)).point_ids).toEqual([point('1.1')]);

    const page = (await getSyllabusPage('it9'))!;
    expect(page.points.map((p) => [p.code, p.lessons.map((l) => l.slug).sort()])).toEqual([
      ['1.1', ['am-gm-inequality', 'projectile-motion']],
      ['1.2', ['projectile-motion']],
      ['1.3', []], // only a draft covers it
    ]);
    expect((await getSyllabusList()).find((x) => x.slug === 'it9')).toMatchObject({ points: 3, covered: 2 });
    expect((await getPostPage('projectile-motion'))!.syllabus).toEqual([
      { syllabus: 'it9', syllabusCode: 'IT9', code: '1.1', title: 'Inequalities' },
      { syllabus: 'it9', syllabusCode: 'IT9', code: '1.2', title: 'Kinematics' },
    ]);

    // Published, the draft appears there too; deleted, it goes (and its syllabus page is rebuilt).
    const section = (await service.from('sections').select('id').eq('subject_id', 'math').limit(1).single()).data!.id;
    await saveDraft(owner, draft.id, 1, { section_id: section, content_json: doc('Body.') });
    const published = await publishPost(owner, draft.id, 2);
    expect(published.paths).toEqual(expect.arrayContaining(['/syllabus', '/syllabus/it9']));
    expect((await getSyllabusPage('it9'))!.points[2]!.lessons.map((l) => l.title)).toEqual(['IT syllabus draft']);
    const gone = await deletePost(owner, draft.id);
    expect(gone.paths).toEqual(expect.arrayContaining(['/syllabus/it9']));

    // Removing a point removes its tags.
    await saveSyllabusPoints(owner, id, [{ id: point('1.2'), code: '1.2', title: 'Kinematics' }]);
    expect((await getPostPage('am-gm-inequality'))!.syllabus).toEqual([]);
  });

  it('refuses bad input', async () => {
    const { id } = await saveSyllabus(owner, null, { code: 'IT8', title: 'IT syllabus 8' });
    made.push(id);
    await expect(saveSyllabus(owner, null, { code: '', title: 'x' })).rejects.toMatchObject({ status: 422 });
    await expect(
      saveSyllabusPoints(owner, id, [
        { code: '1', title: 'a' },
        { code: '1', title: 'b' },
      ]),
    ).rejects.toMatchObject({ status: 422 });
    await expect(saveSyllabusPoints(owner, id, [{ code: '1', title: '' }])).rejects.toMatchObject({ status: 422 });
    const life = (await service.from('posts').select('id').eq('kind', 'life').limit(1).single()).data!.id;
    await expect(setPostSyllabus(owner, life, { point_ids: [] })).rejects.toMatchObject({ status: 404 });
    // A syllabus with no points has no page.
    expect(await getSyllabusPage('it8')).toBeNull();
  });
});
