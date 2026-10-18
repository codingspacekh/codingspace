import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteQuestion, listQuestions, saveQuestion } from '@/server/admin/questions';
import { getPostPage, getQuestionsPage, getQuestionsPost, QUESTIONS_PAGE } from '@/server/data/public';
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

    const waiting = (await listQuestions(owner, { status: 'pending' })).questions.filter((q) =>
      q.name.startsWith('IT '),
    );
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

  it('comments on a life post: the same rules, shown on its page once published', async () => {
    expect(await ask({ post: 'why-i-started-codingspace', name: 'IT Sok', question: 'Nice post!' }, '192.0.2.4')).toBe(
      'ok',
    );
    const [waiting] = (await listQuestions(owner, { status: 'pending' })).questions.filter((q) => q.name === 'IT Sok');
    expect(waiting!.lesson).toMatchObject({ slug: 'why-i-started-codingspace', kind: 'life', live: true });
    expect((await getPostPage('why-i-started-codingspace'))!.questions).toEqual([]);

    expect((await saveQuestion(owner, waiting!.id, { status: 'published', answer: 'Thanks!' })).paths).toEqual([
      '/posts/why-i-started-codingspace',
    ]);
    const shown = (await getPostPage('why-i-started-codingspace'))!.questions!.find((q) => q.name === 'IT Sok')!;
    expect(shown.answerHtml).toContain('Thanks!');
  });

  it('pages: newest first under the post, 20 at a time; the inbox counts, loads more and filters by post', async () => {
    const post = (await getQuestionsPost('why-i-started-codingspace'))!;
    // 25 published comments, a second apart (oldest IT Page 00), straight into the table.
    const start = Date.parse('2026-01-01T00:00:00Z');
    const rows = Array.from({ length: 25 }, (_, i) => ({
      post_id: post.id,
      name: `IT Page ${String(i).padStart(2, '0')}`,
      body: `Comment ${i}`,
      status: 'published',
      created_at: new Date(start + i * 1000).toISOString(),
      published_at: new Date(start + i * 1000).toISOString(),
    }));
    const { error } = await service.from('questions').insert(rows);
    expect(error).toBeNull();

    // Only ours: older than everything else that may be on the post.
    const all: string[] = [];
    let page = await getQuestionsPage(post.id, new Date(start + 25 * 1000).toISOString());
    expect(page.questions).toHaveLength(QUESTIONS_PAGE);
    expect(page.more).toBe(5);
    all.push(...page.questions.map((q) => q.name));
    page = await getQuestionsPage(post.id, page.questions.at(-1)!.publishedAt);
    expect(page).toMatchObject({ more: 0 });
    all.push(...page.questions.map((q) => q.name));
    expect(all).toEqual(rows.map((r) => r.name).reverse());

    // The post page shows the newest page and says how many are older.
    const shown = (await getPostPage('why-i-started-codingspace'))!;
    expect(shown.questions).toHaveLength(QUESTIONS_PAGE);
    expect(shown.questionsMore).toBeGreaterThanOrEqual(5);

    // The inbox: counts per tab, a page at a time, for one post.
    const first = await listQuestions(owner, { status: 'published', post: 'why-i-started-codingspace', limit: '10' });
    expect(first.questions).toHaveLength(10);
    expect(first.counts.published).toBeGreaterThanOrEqual(25);
    expect(first.more).toBe(first.counts.published - 10);
    expect(first.questions.every((q) => q.lesson?.slug === 'why-i-started-codingspace')).toBe(true);
    const next = await listQuestions(owner, {
      status: 'published',
      post: 'why-i-started-codingspace',
      before: first.questions.at(-1)!.created_at,
    });
    expect(next.questions[0]!.created_at < first.questions.at(-1)!.created_at).toBe(true);
    expect(next.more).toBe(Math.max(0, first.more - 50));
    const other = await listQuestions(owner, { status: 'published', post: 'am-gm-inequality' });
    expect(other.questions.some((q) => q.name.startsWith('IT Page'))).toBe(false);
    // Nonsense in the query falls back to the defaults.
    expect(
      (await listQuestions(owner, { status: 'x', before: 'y', post: '../z', limit: 'all' })).questions.length,
    ).toBeLessThanOrEqual(50);
  });

  it('five questions an hour per visitor', async () => {
    for (let i = 0; i < 5; i++)
      expect(await ask({ post: 'projectile-motion', name: 'IT Rate', question: `Q${i}` }, '198.51.100.9')).not.toBe(
        'limited',
      );
    expect(await ask({ post: 'am-gm-inequality', name: 'IT Rate', question: 'Q6' }, '198.51.100.9')).toBe('limited');
  });
});
