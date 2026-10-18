import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProblemsAdmin } from '@/views/admin/problems-admin';
import { render } from '../../../support/subjects';

const problems = () => [
  {
    id: 'p2',
    subject_id: 'math',
    section_id: null,
    week_of: '2026-10-19',
    statement: 'Prove $a^2 \\ge 0$.\nSecond line.',
    hint: '',
    solution: '',
    is_current: true,
    updated_at: '2026-10-16T00:00:00Z',
  },
  {
    id: 'p1',
    subject_id: 'math',
    section_id: null,
    week_of: '2026-10-12',
    statement: 'Older problem.',
    hint: 'Hint.',
    solution: 'Solution.',
    is_current: false,
    updated_at: '2026-10-10T00:00:00Z',
  },
];

type Call = { url: string; method: string; body: unknown };
function mockApi(reply: (c: Call) => [number, unknown] | undefined = () => undefined) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined };
      const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
      if (url === '/api/admin/problems' && call.method === 'GET') return json(200, { problems: problems() });
      if (url.startsWith('/api/admin/sections')) return json(200, { sections: [{ id: 's1', title: 'Inequalities' }] });
      if (url === '/api/admin/problems/preview') {
        const b = call.body as { statement: string; hint: string };
        return json(200, {
          statement: b.statement && `<p>${b.statement}</p>`,
          hint: b.hint && `<p>${b.hint}</p>`,
          solution: '',
        });
      }
      calls.push(call);
      return json(...(reply(call) ?? [200, { ok: true, id: 'new-id' }]));
    }),
  );
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe('problem of the week admin (03 ADM-11)', () => {
  it('lists problems with the one showing marked, first line only', async () => {
    mockApi();
    render(<ProblemsAdmin previewDelay={0} />);
    const list = await screen.findByRole('list', { name: 'Problems, newest week first' });
    const [current, older] = within(list).getAllByRole('listitem');
    expect(current).toHaveTextContent('Math, week of 19 Oct 2026 Showing');
    expect(current).toHaveTextContent('Prove $a^2 \\ge 0$.');
    expect(current).not.toHaveTextContent('Second line');
    expect(older).toHaveTextContent('Hidden');
  });

  it('writes a new problem with a live preview, then adds and shows it', async () => {
    const calls = mockApi();
    render(<ProblemsAdmin previewDelay={0} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'New problem' }));
    const form = screen.getByRole('form', { name: 'New problem' });
    // This week's Monday.
    expect((within(form).getByLabelText('Week of') as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await user.selectOptions(await within(form).findByRole('combobox', { name: 'Topic (section, optional)' }), 's1');
    await user.type(within(form).getByRole('textbox', { name: 'Problem' }), 'Find x.');
    await user.type(within(form).getByRole('textbox', { name: 'Hint (optional)' }), 'Try 2.');
    const preview = screen.getByRole('region', { name: 'Preview' });
    await waitFor(() => expect(preview).toHaveTextContent('Find x.'));
    expect(within(preview).getByText('Show a hint')).toBeInTheDocument();

    await user.click(within(form).getByRole('button', { name: 'Add problem' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: '/api/admin/problems',
      body: { subject_id: 'math', section_id: 's1', statement: 'Find x.', hint: 'Try 2.', solution: '' },
    });
    expect(calls[1]).toEqual({ method: 'PATCH', url: '/api/admin/problems/new-id', body: { current: true } });
    expect(await screen.findByText('Added, and showing it as the Math problem of the week.')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'New problem' })).toBeNull();
  });

  it('can add a problem without showing it yet', async () => {
    const calls = mockApi();
    render(<ProblemsAdmin previewDelay={0} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'New problem' }));
    await user.type(screen.getByRole('textbox', { name: 'Problem' }), 'Later.');
    await user.click(screen.getByRole('checkbox', { name: /Show it on the site now/ }));
    await user.click(screen.getByRole('button', { name: 'Add problem' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Added.'));
    expect(calls.map((c) => c.method)).toEqual(['POST']);
  });

  it('needs the problem text', async () => {
    const calls = mockApi();
    render(<ProblemsAdmin previewDelay={0} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'New problem' }));
    await user.click(screen.getByRole('button', { name: 'Add problem' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Write the problem.');
    expect(calls).toEqual([]);
  });

  it('edits, shows an older problem again, and deletes after confirming', async () => {
    const calls = mockApi();
    render(<ProblemsAdmin previewDelay={0} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit Math, week of 12 Oct 2026' }));
    const form = screen.getByRole('form', { name: 'Edit problem' });
    expect(within(form).getByRole('textbox', { name: 'Solution (optional)' })).toHaveValue('Solution.');
    expect(within(form).queryByRole('checkbox')).toBeNull();
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    await user.click(await screen.findByRole('button', { name: 'Show Math, week of 12 Oct 2026 on the site' }));
    await user.click(screen.getByRole('button', { name: 'Delete Math, week of 19 Oct 2026' }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls.map((c) => [c.method, c.url, c.body])).toEqual([
      [
        'PUT',
        '/api/admin/problems/p1',
        expect.objectContaining({ week_of: '2026-10-12', statement: 'Older problem.' }),
      ],
      ['PATCH', '/api/admin/problems/p1', { current: true }],
      ['DELETE', '/api/admin/problems/p2', undefined],
    ]);
  });

  it('says why a change was refused', async () => {
    mockApi(() => [422, { error: 'the section belongs to another subject' }]);
    render(<ProblemsAdmin previewDelay={0} />);
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Stop showing Math, week of 19 Oct 2026' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Not done: the section belongs to another subject.');
  });
});
