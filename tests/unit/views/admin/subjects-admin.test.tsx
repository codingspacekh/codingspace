import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubjectsAdmin } from '@/views/admin/subjects-admin';
import { render, SUBJECTS } from '../../../support/subjects';

const LIST = [
  { ...SUBJECTS[0]!, visible: true, sections: 2, lessons: 5 },
  { ...SUBJECTS[1]!, visible: true, sections: 0, lessons: 0 },
  {
    id: 'chemistry',
    name: 'Chemistry',
    glyph: '⚗',
    color: 'orange',
    blurb: '',
    intro: '',
    visible: false,
    sections: 0,
    lessons: 0,
  },
];

type Call = { url: string; method: string; body: unknown };

function mockApi(reply: (c: Call) => [number, unknown] = () => [200, { ok: true, failed: [] }]) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call = { url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined };
      calls.push(call);
      if (call.method === 'GET') return new Response(JSON.stringify({ subjects: LIST }), { status: 200 });
      const [status, body] = reply(call);
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe('SubjectsAdmin (v1.1)', () => {
  it('lists the subjects in order, with counts, hidden ones marked', async () => {
    mockApi();
    render(<SubjectsAdmin />);
    const list = await screen.findByRole('list', { name: 'Subjects, in order' });
    const [math, , chemistry] = within(list).getAllByRole('listitem');
    expect(within(math!).getByText(/2 sections · 5 lessons/)).toBeInTheDocument();
    expect(within(math!).getByRole('link', { name: '/study/math' })).toHaveAttribute('href', '/study/math');
    expect(within(math!).getByRole('link', { name: 'Sections' })).toHaveAttribute(
      'href',
      '/admin/sections?subject=math',
    );
    expect(within(chemistry!).getByRole('heading', { name: /Chemistry Hidden/ })).toBeInTheDocument();
    expect(within(chemistry!).getByText(/\/study\/chemistry \(hidden from visitors\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move Math up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Chemistry down' })).toBeDisabled();
  });

  it('deletes only an empty subject, after confirming', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render(<SubjectsAdmin />);
    await screen.findByRole('list', { name: 'Subjects, in order' });
    expect(screen.getByRole('button', { name: 'Delete Math' })).toBeDisabled();
    expect(screen.getByText('To delete this subject, first delete or move its sections and lessons.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Delete Physics' }));
    await user.click(screen.getByRole('button', { name: 'Delete subject' }));
    expect(calls.at(-2)).toMatchObject({ url: '/api/admin/subjects/physics', method: 'DELETE' });
    expect(await screen.findByRole('status')).toHaveTextContent('Deleted “Physics”.');
  });

  it('adds a subject: the address follows the name, and it starts hidden', async () => {
    const calls = mockApi(() => [201, { id: 'furthermaths', failed: [] }]);
    const user = userEvent.setup();
    render(<SubjectsAdmin />);
    const form = await screen.findByRole('form', { name: 'Add a subject' });
    await user.click(within(form).getByRole('button', { name: 'Add subject' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Add a name.');

    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'Further Maths');
    expect(within(form).getByRole('textbox', { name: /Address/ })).toHaveValue('furthermaths');
    await user.type(within(form).getByRole('textbox', { name: /Symbol/ }), '∫');
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Colour' }), 'gold');
    expect(within(form).getByRole('checkbox', { name: 'Show it on the site' })).not.toBeChecked();
    await user.click(within(form).getByRole('button', { name: 'Add subject' }));

    expect(calls.find((c) => c.method === 'POST')).toEqual({
      url: '/api/admin/subjects',
      method: 'POST',
      body: {
        id: 'furthermaths',
        name: 'Further Maths',
        glyph: '∫',
        color: 'gold',
        blurb: '',
        intro: '',
        visible: false,
      },
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Added “Further Maths” at the end, hidden. Show it once it has lessons.',
    );
  });

  it('keeps an address typed by hand, letters only, and refuses one in use', async () => {
    mockApi();
    const user = userEvent.setup();
    render(<SubjectsAdmin />);
    const form = await screen.findByRole('form', { name: 'Add a subject' });
    const address = within(form).getByRole('textbox', { name: /Address/ });
    await user.type(address, 'Chem-2');
    expect(address).toHaveValue('chem');
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'Chemistry');
    expect(address).toHaveValue('chem');
    await user.clear(address);
    await user.type(address, 'math');
    await user.click(within(form).getByRole('button', { name: 'Add subject' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('There is already a subject at /study/math.');
  });

  it('edits a subject and shows it on the site', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    render(<SubjectsAdmin />);
    await user.click(await screen.findByRole('button', { name: 'Edit Chemistry' }));
    const form = screen.getByRole('form', { name: 'Edit Chemistry' });
    expect(within(form).queryByRole('textbox', { name: /Address/ })).toBeNull();
    await user.type(within(form).getByRole('textbox', { name: /One line/ }), 'Atoms up.');
    await user.click(within(form).getByRole('checkbox', { name: 'Show it on the site' }));
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(calls.find((c) => c.method === 'PUT')).toEqual({
      url: '/api/admin/subjects/chemistry',
      method: 'PUT',
      body: {
        id: 'chemistry',
        name: 'Chemistry',
        glyph: '⚗',
        color: 'orange',
        blurb: 'Atoms up.',
        intro: '',
        visible: true,
      },
    });
  });

  it('reorders, and says why a change was refused', async () => {
    const calls = mockApi(() => [409, { error: 'delete or move its sections, lessons and problems first' }]);
    const user = userEvent.setup();
    render(<SubjectsAdmin />);
    await user.click(await screen.findByRole('button', { name: 'Move Physics up' }));
    expect(calls.find((c) => c.method === 'PUT')).toEqual({
      url: '/api/admin/subjects/order',
      method: 'PUT',
      body: { ids: ['physics', 'math', 'chemistry'] },
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Not done: delete or move its sections, lessons and problems first.',
    );
  });
});
