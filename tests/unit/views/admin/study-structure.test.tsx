import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StudyStructure } from '@/views/admin/study-structure';

const lesson = (id: string, title: string) => ({
  id,
  title,
  slug: id,
  status: 'published',
  has_unpublished_changes: false,
});
const data = () => [
  {
    id: 's1',
    slug: 'inequalities',
    title: 'Inequalities',
    description: 'AM–GM',
    sort: 1,
    lessons: [lesson('l1', 'AM–GM'), lesson('l2', 'Cauchy')],
  },
  { id: 's2', slug: 'sequences', title: 'Sequences', description: '', sort: 2, lessons: [] },
];

type Call = { url: string; method: string; body: unknown };
function mockApi(reply: (c: Call) => [number, unknown] = () => [200, { ok: true }]) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined };
      if (call.method === 'GET') return new Response(JSON.stringify({ sections: data() }), { status: 200 });
      calls.push(call);
      const [status, body] = reply(call);
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}
afterEach(() => {
  vi.unstubAllGlobals();
});

const card = (name: string) => screen.getByRole('listitem', { name });

describe('StudyStructure (ADM-12)', () => {
  it('lists the sections in order with their lesson counts', async () => {
    mockApi();
    render(<StudyStructure subject="math" onSubject={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Inequalities' })).toBeInTheDocument();
    expect(card('Inequalities')).toHaveTextContent('2 lessons · #inequalities');
    expect(card('Sequences')).toHaveTextContent('No lessons');
    expect(screen.getByRole('button', { name: 'Math' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('moves a section and sends the whole new order', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render(<StudyStructure subject="math" onSubject={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Inequalities' });
    expect(screen.getByRole('button', { name: 'Move Inequalities up' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Move Sequences up' }));
    expect(calls[0]).toEqual({
      url: '/api/admin/sections/order',
      method: 'PUT',
      body: { subject_id: 'math', ids: ['s2', 's1'] },
    });
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent)
        .slice(0, 2),
    ).toEqual(['Sequences', 'Inequalities']);
    expect(await screen.findByRole('status')).toHaveTextContent('Moved “Sequences” up.');
  });

  it('only an empty section can be deleted, after confirming', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render(<StudyStructure subject="math" onSubject={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Inequalities' });
    expect(screen.getByRole('button', { name: 'Delete Inequalities' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete Inequalities' })).toHaveAccessibleDescription(
      'To delete it, move or delete its 2 lessons first.',
    );
    await user.click(screen.getByRole('button', { name: 'Delete Sequences' }));
    await user.click(within(card('Sequences')).getByRole('button', { name: 'Delete permanently' }));
    expect(calls[0]).toMatchObject({ url: '/api/admin/sections/s2', method: 'DELETE' });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Sequences' })).toBeNull());
  });

  it('renames and describes a section', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render(<StudyStructure subject="math" onSubject={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Edit Inequalities' }));
    const form = screen.getByRole('form', { name: 'Edit Inequalities' });
    const title = within(form).getByRole('textbox', { name: 'Title' });
    await user.clear(title);
    await user.type(title, 'Classical inequalities');
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(calls[0]).toEqual({
      url: '/api/admin/sections/s1',
      method: 'PATCH',
      body: { title: 'Classical inequalities', description: 'AM–GM' },
    });
    expect(await screen.findByRole('heading', { name: 'Classical inequalities' })).toBeInTheDocument();
  });

  it('orders the lessons inside a section', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render(<StudyStructure subject="math" onSubject={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Order lessons' }));
    const list = screen.getByRole('list', { name: 'Lessons in Inequalities, in order' });
    await user.click(within(list).getByRole('button', { name: 'Move Cauchy up' }));
    expect(calls[0]).toEqual({ url: '/api/admin/sections/s1/lessons', method: 'PUT', body: { ids: ['l2', 'l1'] } });
    expect(
      within(list)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Cauchy', 'AM–GM']);
  });

  it('adds a section, and reloads to undo a refused change', async () => {
    const calls = mockApi((c) => (c.method === 'PUT' ? [409, { error: 'the order changed' }] : [201, { id: 's3' }]));
    const user = userEvent.setup();
    render(<StudyStructure subject="math" onSubject={vi.fn()} />);
    const add = await screen.findByRole('form', { name: 'Add a section to Math' });
    await user.type(within(add).getByRole('textbox', { name: 'Title' }), 'Combinatorics');
    await user.click(within(add).getByRole('button', { name: 'Add section' }));
    expect(calls[0]).toMatchObject({
      url: '/api/admin/sections',
      method: 'POST',
      body: { subject_id: 'math', title: 'Combinatorics' },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Added “Combinatorics” at the end.');

    await user.click(screen.getByRole('button', { name: 'Move Sequences up' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Not done: the order changed.');
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('heading', { level: 2 })
          .map((h) => h.textContent)
          .slice(0, 2),
      ).toEqual(['Inequalities', 'Sequences']),
    );
  });
});
