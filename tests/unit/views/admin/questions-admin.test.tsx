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
  lesson: { slug: 'am-gm', title: 'The AM–GM inequality', live: true },
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
            ? [q('q1', 'pending')]
            : status === 'published'
              ? [q('q2', 'published', { answer: 'Old.' })]
              : [];
        return new Response(JSON.stringify({ questions: list }), { status: 200 });
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
    const list = await screen.findByRole('list', { name: 'Waiting questions' });
    const card = within(list).getByRole('listitem');
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

  it('edits an answer, hides and deletes on the other tabs', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render(<QuestionsAdmin />);
    await user.click(await screen.findByRole('button', { name: 'Published' }));
    const card = within(await screen.findByRole('list', { name: 'Published questions' })).getByRole('listitem');
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
    await user.click(screen.getByRole('button', { name: 'Hidden' }));
    expect(await screen.findByText('Nothing hidden.')).toBeInTheDocument();
  });
});
