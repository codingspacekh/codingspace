import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteQuestion, listQuestions, saveQuestion } from '@/server/admin/questions';
import { getPostPage } from '@/server/data/public';
import { askQuestion } from '@/server/data/questions';
import { ownerSession, serviceClient } from '../support/admin-users';
import { ensureContent } from '../support/content';

// v1.1 questions on lessons against a real database (needs content:import's lessons).

let owner: SupabaseClient;
let service: SupabaseClient;

const ask = (body: Record<string, unknown>, ip = '203.0.113.7') =>
  askQuestion({ body, headers: { 'x-forwarded-for': ip }, socket: {} } as never);

beforeAll(async () => {
  owner = await ownerSession();
  service = serviceClient();
  await ensureContent(service);
  await service.from('questions').delete().like('name', 'IT %');
});
afterAll(async () => {
  await service.from('questions').delete().like('name', 'IT %');
});

describe('questions on lessons', () => {
  it('asked → waiting → published with an answer → on the lesson page', async () => {
    expect(await ask({ post: 'am-gm-inequality', name: 'IT Dara', question: 'Why does $x^2 \\ge 0$ help?' })).toBe(
      'ok',
    );
    expect(await ask({ post: 'am-gm-inequality', name: 'IT Bot', question: 'cheap pills', website: 'x' })).toBe('ok');
    expect(await ask({ post: 'no-such-lesson', name: 'IT Dara', question: 'Q' })).toBe('not_found');
    expect(await ask({ post: 'am-gm-inequality', name: '', question: 'Q' })).toBe('invalid');
    expect(
      await ask({ post: 'am-gm-inequality', name: 'IT Dara', question: 'a https://a.x b https://b.x c https://c.x' }),
    ).toBe('invalid');

    const waiting = (await listQuestions(owner, 'pending')).filter((q) => q.name.startsWith('IT '));
    expect(waiting.map((q) => q.name)).toEqual(['IT Dara']); // the bot's was never stored
    expect(waiting[0]!.lesson).toMatchObject({ slug: 'am-gm-inequality', live: true });
    expect((await getPostPage('am-gm-inequality'))!.questions!.some((q) => q.name === 'IT Dara')).toBe(false);

    const { paths } = await saveQuestion(owner, waiting[0]!.id, {
      status: 'published',
      answer: 'Squares are **never** negative.',
    });
    expect(paths).toEqual(['/posts/am-gm-inequality']);
    const shown = (await getPostPage('am-gm-inequality'))!.questions!.find((q) => q.name === 'IT Dara')!;
    expect(shown.hasMath).toBe(true);
    expect(shown.answerHtml).toContain('<strong>never</strong>');

    await saveQuestion(owner, waiting[0]!.id, { status: 'hidden', answer: '' });
    expect((await getPostPage('am-gm-inequality'))!.questions!.some((q) => q.name === 'IT Dara')).toBe(false);
    expect((await deleteQuestion(owner, waiting[0]!.id)).paths).toEqual(['/posts/am-gm-inequality']);
    await expect(saveQuestion(owner, waiting[0]!.id, { status: 'published' })).rejects.toMatchObject({ status: 404 });
  });

  it('five questions an hour per visitor', async () => {
    for (let i = 0; i < 5; i++)
      expect(await ask({ post: 'projectile-motion', name: 'IT Rate', question: `Q${i}` }, '198.51.100.9')).not.toBe(
        'limited',
      );
    expect(await ask({ post: 'am-gm-inequality', name: 'IT Rate', question: 'Q6' }, '198.51.100.9')).toBe('limited');
  });
});
