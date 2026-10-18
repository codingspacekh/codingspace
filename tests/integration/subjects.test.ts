import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/server/admin/errors';
import { createSection } from '@/server/admin/sections';
import {
  deleteSubject,
  listSubjects,
  listSubjectsWithCounts,
  reorderSubjects,
  saveSubject,
} from '@/server/admin/subjects';
import { getPostPage, getSubjects, getSubjectSections } from '@/server/data/public';
import { ownerSession, serviceClient } from '../support/admin-users';

// v1.1 subjects from the admin, against a real database (needs content:import's lessons): the
// owner adds a subject, builds it while hidden, then shows it; visitors see nothing of it before.

const ID = 'itchemistry';
const FIELDS = { name: 'IT Chemistry', glyph: '⚗', color: 'orange', blurb: 'Atoms up.', intro: 'From atoms.' };

let owner: SupabaseClient;
let service: SupabaseClient;

async function cleanUp() {
  await service.from('posts').delete().eq('subject_id', ID);
  await service.from('sections').delete().eq('subject_id', ID);
  await service.from('subjects').delete().eq('id', ID);
}
beforeAll(async () => {
  owner = await ownerSession();
  service = serviceClient();
  await cleanUp();
});
afterAll(cleanUp);

describe('subjects', () => {
  it('a hidden subject: built by the owner, invisible to visitors, then shown', async () => {
    const before = (await getSubjects()).map((s) => s.id);
    expect(before).toEqual(['math', 'physics', 'coding', 'it']);

    const added = await saveSubject(owner, null, { ...FIELDS, id: ID, visible: false });
    expect(added).toEqual({ id: ID, paths: [] }); // nothing public changed
    expect((await listSubjects(owner)).at(-1)).toEqual({ id: ID, ...FIELDS, visible: false });

    const { id: sectionId } = await createSection(owner, { subject_id: ID, title: 'IT Acids' });
    const { error } = await service.from('posts').insert({
      kind: 'lesson',
      slug: 'it-titration',
      subject_id: ID,
      section_id: sectionId,
      status: 'published',
      title: 'IT Titration',
      live_title: 'IT Titration',
      live_html: '<p>Drop by drop.</p>',
      published_at: new Date().toISOString(),
      live_revision: 1,
      live_subject_id: ID,
      live_section_id: sectionId,
      live_level: 1,
      live_minutes: 5,
      live_problem_count: 0,
      live_lang: 'en',
    });
    expect(error).toBeNull();
    expect((await listSubjectsWithCounts(owner)).find((s) => s.id === ID)).toMatchObject({ sections: 1, lessons: 1 });

    expect((await getSubjects()).map((s) => s.id)).toEqual(before);
    expect(await getSubjectSections(ID)).toEqual([]);
    expect(await getPostPage('it-titration')).toBeNull();

    const shown = await saveSubject(owner, ID, { ...FIELDS, visible: true });
    expect(shown.paths).toEqual(
      expect.arrayContaining(['/', `/study/${ID}`, '/study/math', '/series', '/saved', '/posts/it-titration']),
    );
    expect((await getSubjects()).at(-1)).toEqual({ id: ID, ...FIELDS });
    expect((await getSubjectSections(ID)).map((s) => s.title)).toEqual(['IT Acids']);
    expect((await getPostPage('it-titration'))?.post.subject).toBe(ID);
  });

  it('reorders, refuses to delete a subject with lessons, deletes an empty one', async () => {
    const { paths } = await reorderSubjects(owner, { ids: [ID, 'math', 'physics', 'coding', 'it'] });
    expect(paths).toContain('/posts/it-titration');
    expect((await getSubjects()).map((s) => s.id)).toEqual([ID, 'math', 'physics', 'coding', 'it']);

    await expect(deleteSubject(owner, ID)).rejects.toMatchObject({ status: 409 });
    await service.from('posts').delete().eq('subject_id', ID);
    await service.from('sections').delete().eq('subject_id', ID);
    const gone = await deleteSubject(owner, ID);
    expect(gone.paths).toContain(`/study/${ID}`); // rebuilt as a 404
    expect((await getSubjects()).map((s) => s.id)).toEqual(['math', 'physics', 'coding', 'it']);
  });

  it('refuses bad input: a used address, a colour off the palette, an unknown subject elsewhere', async () => {
    await expect(saveSubject(owner, null, { ...FIELDS, id: 'math', visible: false })).rejects.toThrow(
      'there is already a subject at /study/math',
    );
    await expect(saveSubject(owner, null, { ...FIELDS, color: 'plaid', visible: false })).rejects.toBeInstanceOf(
      ApiError,
    );
    await expect(saveSubject(owner, 'nope', { ...FIELDS, visible: true })).rejects.toMatchObject({ status: 404 });
    await expect(createSection(owner, { subject_id: 'nope', title: 'X' })).rejects.toMatchObject({ status: 422 });
  });
});
