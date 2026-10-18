import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestionsAdmin } from '@/views/admin/questions-admin';
import { render } from '../../../support/subjects';

const q = (id: string, status: string, extra = {}) => ({
  id,
  name: 'Dara',
  body: 'Why is **it** true?\nThanks',
  answer: '',
  status,
  created_at: '2026-10-18T03:00:00Z',
  lesson: { slug: 'am-gm', title: 'The AM–GM inequality', live: true, kind: 'lesson' },
  ...extra,
});

type Call = { url: string; method: string; body: unknown };
function mockApi() {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      if (method === 'GET') {
        const status = new URL(url, 'http://x').searchParams.get('status');
        const list =
          status === 'pending'
            ? [
                q('q1', 'pending'),
                q('c1', 'pending', {
                  name: 'Sok',
                  body: 'Nice post!',
                  lesson: { slug: 'my-week', title: 'My week', live: true, kind: 'life' },
                }),
              ]
            : status === 'published'
              ? [q('q2', 'published', { answer: 'Old.' })]
              : [];
        return new Response(
          JSON.stringify({ questions: list, counts: { pending: 2, published: 1, hidden: 0 }, more: 0 }),
          { status: 200 },
        );
      }
      calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(JSON.stringify({ ok: true, failed: [] }), { status: 200 });
    }),
  );
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe('QuestionsAdmin (v1.1)', () => {
  it('shows waiting questions as typed, and publishes one with an answer', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render(<QuestionsAdmin />);
    const list = await screen.findByRole('list', { name: 'Waiting questions and comments' });
    const card = within(list).getAllByRole('listitem')[0]!;
    expect(card).toHaveTextContent('Question on The AM–GM inequality');
    expect(within(card).getByText(/Why is \*\*it\*\* true\?/)).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'The AM–GM inequality' })).toHaveAttribute(
      'href',
      '/posts/am-gm#questions',
    );
    await user.type(within(card).getByRole('textbox', { name: /Your answer/ }), 'Squares.');
    await user.click(within(card).getByRole('button', { name: 'Publish with answer' }));
    await waitFor(() =>
      expect(calls[0]).toEqual({
        url: '/api/admin/questions/q1',
        method: 'PUT',
        body: { status: 'published', answer: 'Squares.' },
      }),
    );
    expect(await screen.findByText('Published, with your answer.')).toBeInTheDocument();
  });

  it('shows a comment on a life post with a reply instead of an answer', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render(<QuestionsAdmin />);
    const list = await screen.findByRole('list', { name: 'Waiting questions and comments' });
    const card = within(list).getAllByRole('listitem')[1]!;
    expect(card).toHaveTextContent('Comment on My week');
    expect(within(card).getByRole('link', { name: 'My week' })).toHaveAttribute('href', '/posts/my-week#comments');
    await user.type(within(card).getByRole('textbox', { name: /Your reply/ }), 'Thanks!');
    await user.click(within(card).getByRole('button', { name: 'Publish with reply' }));
    await waitFor(() =>
      expect(calls[0]).toEqual({
        url: '/api/admin/questions/c1',
        method: 'PUT',
        body: { status: 'published', answer: 'Thanks!' },
      }),
    );
    expect(await screen.findByText('Published, with your reply.')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Delete Sok’s comment' })).toBeInTheDocument();
  });

  it('edits an answer, hides and deletes on the other tabs', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render(<QuestionsAdmin />);
    await user.click(await screen.findByRole('button', { name: 'Published (1)' }));
    const card = within(await screen.findByRole('list', { name: 'Published questions and comments' })).getByRole(
      'listitem',
    );
    const save = within(card).getByRole('button', { name: 'Save answer' });
    expect(save).toBeDisabled();
    await user.type(within(card).getByRole('textbox', { name: /Your answer/ }), ' More.');
    await user.click(save);
    await user.click(within(card).getByRole('button', { name: 'Hide' }));
    await user.click(within(card).getByRole('button', { name: 'Delete Dara’s question' }));
    await user.click(within(card).getByRole('button', { name: 'Delete question' }));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls.map((c) => [c.method, c.body])).toEqual([
      ['PUT', { status: 'published', answer: 'Old. More.' }],
      ['PUT', { status: 'hidden', answer: 'Old. More.' }],
      ['DELETE', undefined],
    ]);
    await user.click(screen.getByRole('button', { name: 'Hidden (0)' }));
    expect(await screen.findByText('Nothing hidden.')).toBeInTheDocument();
  });

  it('counts each tab, loads more and narrows to one post', async () => {
    const urls: string[] = [];
    const page = (from: number, n: number, slug = 'am-gm') =>
      Array.from({ length: n }, (_, i) =>
        q(`p${from + i}`, 'pending', {
          name: `Student ${from + i}`,
          created_at: new Date(Date.UTC(2026, 9, 18) - (from + i) * 60_000).toISOString(),
          lesson: { slug, title: slug === 'am-gm' ? 'The AM–GM inequality' : 'My week', live: true, kind: 'lesson' },
        }),
      );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        const p = new URL(url, 'http://x').searchParams;
        const body = p.get('post')
          ? { questions: page(0, 2), counts: { pending: 2, published: 0, hidden: 0 }, more: 0 }
          : p.get('before')
            ? { questions: page(5, 3), counts: { pending: 8, published: 3, hidden: 1 }, more: 0 }
            : { questions: page(0, 5), counts: { pending: 8, published: 3, hidden: 1 }, more: 3 };
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    const user = userEvent.setup();
    render(<QuestionsAdmin />);
    const list = await screen.findByRole('list', { name: 'Waiting questions and comments' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Waiting (8)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Published (3)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hidden (1)' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Load more (3 older)' }));
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(8));
    expect(urls[1]).toBe(`/api/admin/questions?status=pending&before=${encodeURIComponent(page(4, 1)[0]!.created_at)}`);
    expect(screen.queryByRole('button', { name: /Load more/ })).toBeNull();

    const card = within(list).getAllByRole('listitem')[0]!;
    await user.click(within(card).getByRole('button', { name: 'Only this post: The AM–GM inequality' }));
    const narrowed = await screen.findByRole('list', { name: 'Waiting questions and comments' });
    await waitFor(() => expect(within(narrowed).getAllByRole('listitem')).toHaveLength(2));
    expect(urls.at(-1)).toBe('/api/admin/questions?status=pending&post=am-gm');
    expect(screen.getByText('The AM–GM inequality', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Waiting (2)' })).toBeInTheDocument();
    expect(within(narrowed).queryByRole('button', { name: /Only this post/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Show all posts' }));
    await waitFor(() => expect(urls.at(-1)).toBe('/api/admin/questions?status=pending'));
    expect(await screen.findByRole('button', { name: 'Waiting (8)' })).toBeInTheDocument();
  });
});
