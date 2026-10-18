import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SeriesAdmin } from '@/views/admin/series-admin';
import { render } from '../../../support/subjects';

const LESSONS = [
  { id: 'l1', slug: 'vectors', title: 'Vectors', subject_id: 'math', status: 'published' },
  { id: 'l2', slug: 'projectile-motion', title: 'Projectile motion', subject_id: 'physics', status: 'published' },
  { id: 'l3', slug: 'calculus', title: 'Calculus', subject_id: 'math', status: 'draft' },
];
const SERIES = [
  {
    id: 's1',
    slug: 'maths-for-physics',
    title: 'Maths for Physics',
    description: 'Tools first.',
    sort: 1,
    post_ids: ['l1', 'l2'],
  },
  { id: 's2', slug: 'later', title: 'Later', description: '', sort: 2, post_ids: ['l3'] },
];

type Call = { url: string; method: string; body: unknown };

function mockApi() {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (method === 'GET') return new Response(JSON.stringify({ series: SERIES, lessons: LESSONS }), { status: 200 });
      return new Response(JSON.stringify({ ok: true, id: 'new', failed: [] }), {
        status: method === 'POST' ? 201 : 200,
      });
    }),
  );
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe('SeriesAdmin (v1.1)', () => {
  it('lists each series with its lessons, subjects and drafts', async () => {
    mockApi();
    render(<SeriesAdmin />);
    const list = await screen.findByRole('list', { name: 'Series, in order' });
    const first = within(list).getAllByRole('listitem')[0]!;
    expect(within(first).getByRole('heading', { name: 'Maths for Physics' })).toBeInTheDocument();
    expect(within(first).getByText(/2 lessons · Math, Physics/)).toBeInTheDocument();
    expect(within(first).getByRole('link', { name: '/series/maths-for-physics' })).toHaveAttribute(
      'href',
      '/series/maths-for-physics',
    );
    expect(screen.getByText('Visitors see this series once one of its lessons is live.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move Maths for Physics up' })).toBeDisabled();
  });

  it('adds a series with lessons from two subjects, in the chosen order', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render(<SeriesAdmin />);
    const form = await screen.findByRole('form', { name: 'Add a series' });
    await user.click(within(form).getByRole('button', { name: 'Add series' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Add a title.');

    await user.type(within(form).getByRole('textbox', { name: 'Title' }), 'Mechanics path');
    const pick = within(form).getByRole('combobox', { name: 'Add a lesson' });
    await user.selectOptions(pick, 'l2');
    await user.click(within(form).getByRole('button', { name: 'Add to the series' }));
    await user.selectOptions(pick, 'l3');
    await user.click(within(form).getByRole('button', { name: 'Add to the series' }));
    expect(within(pick).queryByRole('option', { name: 'Projectile motion' })).toBeNull();
    expect(within(form).getByText('draft')).toBeInTheDocument();

    await user.click(within(form).getByRole('button', { name: 'Move Calculus up' }));
    await user.click(within(form).getByRole('button', { name: 'Add series' }));
    expect(calls.find((c) => c.method === 'POST')).toEqual({
      url: '/api/admin/series',
      method: 'POST',
      body: { title: 'Mechanics path', description: '', post_ids: ['l3', 'l2'] },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Added “Mechanics path” at the end.');
  });

  it('edits, reorders and deletes', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render(<SeriesAdmin />);
    await user.click(await screen.findByRole('button', { name: 'Edit Maths for Physics' }));
    const form = screen.getByRole('form', { name: 'Edit Maths for Physics' });
    await user.click(within(form).getByRole('button', { name: 'Remove Vectors' }));
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(calls.find((c) => c.method === 'PUT')).toMatchObject({
      url: '/api/admin/series/s1',
      body: { title: 'Maths for Physics', description: 'Tools first.', post_ids: ['l2'] },
    });

    await user.click(await screen.findByRole('button', { name: 'Move Later up' }));
    expect(calls.find((c) => c.url === '/api/admin/series/order')?.body).toEqual({ ids: ['s2', 's1'] });

    await user.click(screen.getAllByRole('button', { name: /^Delete / })[0]!);
    await user.click(screen.getByRole('button', { name: 'Delete series' }));
    expect(calls.at(-2)).toMatchObject({ method: 'DELETE' });
  });
});
