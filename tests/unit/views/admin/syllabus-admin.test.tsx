import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SyllabusAdmin } from '@/views/admin/syllabus-admin';
import { SyllabusPicker } from '@/views/admin/syllabus-picker';
import { render } from '../../../support/subjects';

const SYLLABUSES = [
  {
    id: 'y1',
    slug: '9618',
    code: '9618',
    title: 'Computer Science 9618',
    description: '',
    subject_id: 'coding',
    points: [
      { id: 'pt1', code: '1.1', title: 'Data representation', lessons: 2 },
      { id: 'pt2', code: '1.2', title: 'Multimedia', lessons: 0 },
    ],
  },
];

type Call = { url: string; method: string; body: unknown };
function mockApi(get: unknown, reply: (c: Call) => [number, unknown] = () => [200, { ok: true, failed: [] }]) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call = { url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined };
      if (call.method === 'GET') return new Response(JSON.stringify(get), { status: 200 });
      calls.push(call);
      const [status, body] = reply(call);
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe('SyllabusAdmin (v1.1)', () => {
  it('lists syllabuses with their points and how many lessons are tagged', async () => {
    mockApi({ syllabuses: SYLLABUSES });
    render(<SyllabusAdmin />);
    const list = await screen.findByRole('list', { name: 'Syllabuses, in order' });
    expect(within(list).getByText(/2 points · 2 lesson tags/)).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: '/syllabus/9618' })).toHaveAttribute('href', '/syllabus/9618');
  });

  it('adds a syllabus', async () => {
    const calls = mockApi({ syllabuses: [] }, () => [201, { id: 'new' }]);
    const user = userEvent.setup();
    render(<SyllabusAdmin />);
    const form = await screen.findByRole('form', { name: 'Add a syllabus' });
    await user.click(within(form).getByRole('button', { name: 'Add syllabus' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Add a code, like 9618.');
    await user.type(within(form).getByRole('textbox', { name: /Code/ }), '9626');
    await user.type(within(form).getByRole('textbox', { name: /Title/ }), 'Information Technology 9626');
    await user.selectOptions(within(form).getByRole('combobox', { name: /Subject/ }), 'it');
    await user.click(within(form).getByRole('button', { name: 'Add syllabus' }));
    await waitFor(() =>
      expect(calls[0]).toEqual({
        url: '/api/admin/syllabuses',
        method: 'POST',
        body: { code: '9626', title: 'Information Technology 9626', description: '', subject_id: 'it' },
      }),
    );
  });

  it('pastes points, edits and removes one, and saves the whole list with ids kept', async () => {
    const calls = mockApi({ syllabuses: SYLLABUSES });
    const user = userEvent.setup();
    render(<SyllabusAdmin />);
    await user.click(await screen.findByText('Points', { selector: 'summary' }));
    const form = screen.getByRole('form', { name: 'Points of Computer Science 9618' });
    await user.type(within(form).getByRole('textbox', { name: /Or paste a list/ }), '1.3 Compression\nnot a point');
    await user.click(within(form).getByRole('button', { name: 'Add the pasted points' }));
    expect(within(form).getByText(/Added 1 point below/)).toHaveTextContent('Line 2: “not a point” needs a code');

    await user.click(within(form).getByRole('button', { name: 'Remove point 1.1' }));
    expect(within(form).getByText('Saving removes 1.1 and their lesson tags.')).toBeInTheDocument();
    const titles = within(form).getAllByRole('textbox', { name: 'Title' });
    await user.clear(titles[0]!);
    await user.type(titles[0]!, 'Images and sound');
    await user.click(within(form).getByRole('button', { name: 'Save points' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      url: '/api/admin/syllabuses/y1/points',
      method: 'PUT',
      body: [
        { id: 'pt2', code: '1.2', title: 'Images and sound' },
        { code: '1.3', title: 'Compression' },
      ],
    });
  });

  it('refuses two points with the same code', async () => {
    const calls = mockApi({ syllabuses: SYLLABUSES });
    const user = userEvent.setup();
    render(<SyllabusAdmin />);
    await user.click(await screen.findByText('Points', { selector: 'summary' }));
    const form = screen.getByRole('form', { name: 'Points of Computer Science 9618' });
    const codes = within(form).getAllByRole('textbox', { name: 'Code' });
    await user.clear(codes[1]!);
    await user.type(codes[1]!, '1.1');
    await user.click(within(form).getByRole('button', { name: 'Save points' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Two points have the same code.');
    expect(calls).toEqual([]);
  });
});

describe('SyllabusPicker (v1.1)', () => {
  const choices = {
    syllabuses: [{ id: 'y1', code: '9618', title: 'Computer Science 9618', points: SYLLABUSES[0]!.points }],
    point_ids: ['pt1'],
  };

  it('tags the lesson at once, and undoes the tick if the save fails', async () => {
    let ok = true;
    const calls = mockApi(choices, () => (ok ? [200, { ok: true }] : [422, { error: 'unknown syllabus point' }]));
    const user = userEvent.setup();
    render(<SyllabusPicker postId="p1" />);
    const multimedia = await screen.findByRole('checkbox', { name: '1.2 Multimedia' });
    expect(screen.getByRole('checkbox', { name: '1.1 Data representation' })).toBeChecked();
    await user.click(multimedia);
    await waitFor(() => expect(screen.getByText('Tagged with 9618 1.2.')).toBeInTheDocument());
    expect(calls[0]).toEqual({
      url: '/api/admin/posts/p1/syllabus',
      method: 'PUT',
      body: { point_ids: ['pt1', 'pt2'] },
    });

    ok = false;
    await user.click(screen.getByRole('checkbox', { name: '1.1 Data representation' }));
    await waitFor(() => expect(screen.getByText('Not saved: unknown syllabus point.')).toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: '1.1 Data representation' })).toBeChecked();
  });

  it('points to the Syllabus page when there are no points yet', async () => {
    mockApi({ syllabuses: [], point_ids: [] });
    render(<SyllabusPicker postId="p1" />);
    expect(await screen.findByRole('link', { name: 'Syllabus' })).toHaveAttribute('href', '/admin/syllabus');
  });
});
