import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectsAdmin } from '@/views/admin/projects-admin';

const project = (id: string, name: string, extra = {}) => ({
  id,
  slug: id,
  name,
  glyph: '',
  subject_id: null,
  tag: '',
  description: `${name} description`,
  platforms: [],
  landing_url: `https://${id}.example`,
  is_featured: false,
  sort: 1,
  ...extra,
});
const projects = () => [
  project('quiz', 'Quiz', { is_featured: true, subject_id: 'coding', tag: 'Web app', platforms: ['Web'] }),
  project('sim', 'Simulator'),
];

type Call = { url: string; method: string; body: unknown };
function mockApi(reply: (c: Call) => [number, unknown] = () => [200, { ok: true }]) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined };
      if (call.method === 'GET') return new Response(JSON.stringify({ projects: projects() }), { status: 200 });
      calls.push(call);
      const [status, body] = reply(call);
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe('projects admin (03 ADM-13)', () => {
  it('lists projects in order with the featured one marked', async () => {
    mockApi();
    render(<ProjectsAdmin />);
    const list = await screen.findByRole('list', { name: 'Projects, in order' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Quiz Featured');
    expect(items[0]).toHaveTextContent('Coding · Web app · Web');
    expect(within(items[0]!).getByRole('button', { name: 'Feature Quiz' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(items[0]!).getByRole('button', { name: 'Move Quiz up' })).toBeDisabled();
  });

  it('adds a project, refusing an http landing page with the reason', async () => {
    const calls = mockApi(() => [201, { id: 'new' }]);
    render(<ProjectsAdmin />);
    const form = await screen.findByRole('form', { name: 'Add a project' });
    const user = userEvent.setup();
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'Graph lab');
    await user.type(within(form).getByRole('textbox', { name: 'Short description' }), 'Plot functions.');
    const url = within(form).getByRole('textbox', { name: 'Landing page' });
    await user.clear(url);
    await user.type(url, 'http://graph.example');
    await user.click(within(form).getByRole('button', { name: 'Add project' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('must start with https://');
    expect(calls).toEqual([]);

    await user.clear(url);
    await user.type(url, 'https://graph.example');
    await user.type(within(form).getByRole('textbox', { name: /Platforms/ }), 'Web, Windows,');
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Subject' }), 'math');
    await user.click(within(form).getByRole('button', { name: 'Add project' }));
    await waitFor(() =>
      expect(calls[0]).toEqual({
        url: '/api/admin/projects',
        method: 'POST',
        body: {
          name: 'Graph lab',
          description: 'Plot functions.',
          landing_url: 'https://graph.example',
          subject_id: 'math',
          tag: '',
          glyph: '',
          platforms: ['Web', 'Windows'],
        },
      }),
    );
    expect(await screen.findByText('Added “Graph lab” at the end.')).toBeInTheDocument();
    expect(within(form).getByRole('textbox', { name: 'Name' })).toHaveValue('');
  });

  it('features another project, moves one and deletes after confirming', async () => {
    const calls = mockApi();
    render(<ProjectsAdmin />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Feature Simulator' }));
    await user.click(screen.getByRole('button', { name: 'Move Simulator up' }));
    await user.click(screen.getByRole('button', { name: 'Delete Simulator' }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls.map((c) => [c.method, c.url, c.body])).toEqual([
      ['PUT', '/api/admin/projects/featured', { id: 'sim' }],
      ['PUT', '/api/admin/projects/order', { ids: ['sim', 'quiz'] }],
      ['DELETE', '/api/admin/projects/sim', undefined],
    ]);
  });

  it('edits a project in place', async () => {
    const calls = mockApi();
    render(<ProjectsAdmin />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit Quiz' }));
    const form = screen.getByRole('form', { name: 'Edit Quiz' });
    expect(within(form).getByRole('textbox', { name: /Platforms/ })).toHaveValue('Web');
    await user.clear(within(form).getByRole('textbox', { name: 'Name' }));
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'Quiz 2');
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(calls[0]).toMatchObject({ method: 'PUT', url: '/api/admin/projects/quiz', body: { name: 'Quiz 2' } }),
    );
    expect(screen.queryByRole('form', { name: 'Edit Quiz' })).toBeNull();
  });

  it('says why a change was refused', async () => {
    mockApi(() => [422, { error: 'landing_url: The address must start with https://' }]);
    render(<ProjectsAdmin />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Feature Simulator' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Not done: landing_url');
  });

  it('shows an error when the list cannot load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    );
    render(<ProjectsAdmin />);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
  });
});
