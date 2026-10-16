import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditPost } from '@/views/admin/edit-post';

beforeAll(() => {
  const rect = () => ({ x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON: () => ({}) });
  Range.prototype.getBoundingClientRect = rect as never;
  Range.prototype.getClientRects = (() => ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: [][Symbol.iterator],
  })) as never;
  document.elementFromPoint = () => null;
});

const post = {
  id: 'p1',
  kind: 'lesson',
  slug: 'lesson-2026-10-16',
  title: '',
  summary: '',
  content_json: { type: 'doc', content: [{ type: 'paragraph' }] },
  subject_id: 'math',
  section_id: null,
  level: 1,
  minutes: 1,
  problem_count: 0,
  lang: 'en',
  status: 'draft',
  revision: 3,
  published_at: null,
  scheduled_at: null,
  has_unpublished_changes: false,
};

function mockApi(put: (body: { revision: number; fields: Record<string, unknown> }) => [number, unknown]) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      const [status, body] = put(JSON.parse(String(init.body)));
      return new Response(JSON.stringify(body), { status });
    }
    return new Response(
      JSON.stringify({ post, sections: [{ id: 's1', subject_id: 'math', title: 'Inequalities', sort: 0 }] }),
      { status: 200 },
    );
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EditPost', () => {
  it('saves title, settings and body with the current revision, then shows the new address', async () => {
    const puts: { revision: number; fields: Record<string, unknown> }[] = [];
    mockApi((body) => {
      puts.push(body);
      return [200, { revision: body.revision + 1, slug: 'am-gm' }];
    });
    const user = userEvent.setup();
    render(<EditPost id="p1" />);
    await user.type(await screen.findByRole('textbox', { name: 'Title' }), 'AM–GM');
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Section' }), 's1');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('All changes saved'));
    expect(puts[0]).toMatchObject({ revision: 3, fields: { title: 'AM–GM', section_id: 's1', subject_id: 'math' } });
    expect(screen.getByText('codingspace.io/posts/am-gm')).toBeInTheDocument();

    // The next save sends the revision the server returned.
    await user.type(screen.getByRole('textbox', { name: 'Title' }), '!');
    act(() => void fireEvent.keyDown(window, { key: 's', ctrlKey: true }));
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1]!.revision).toBe(4);
  });

  it('stops saving after a conflict (another tab saved first)', async () => {
    const fetch = mockApi(() => [409, { error: 'the post changed since revision 3' }]);
    const user = userEvent.setup();
    render(<EditPost id="p1" />);
    await user.type(await screen.findByRole('textbox', { name: 'Title' }), 'x');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('changed in another tab'));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'y');
    expect(screen.getByRole('status')).toHaveTextContent('changed in another tab');
    expect(fetch.mock.calls.filter(([, i]) => i?.method === 'PUT')).toHaveLength(1);
  });

  it('warns before leaving with unsaved changes', async () => {
    mockApi(() => [200, { revision: 4, slug: 'x' }]);
    const user = userEvent.setup();
    render(<EditPost id="p1" />);
    await user.type(await screen.findByRole('textbox', { name: 'Title' }), 'x');
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('says so when the post does not exist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'post not found' }), { status: 404 })),
    );
    render(<EditPost id="missing" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('does not exist');
  });
});
