import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AUTOSAVE_MS, EditPost } from '@/views/admin/edit-post';

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

const basePost = {
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

type Put = { revision: number; fields: Record<string, unknown> };
type Reply = [number, unknown] | 'network';

/** Routes fetch(): GET post, PUT saves (replies from `puts`), revisions and restore. */
function mockApi({
  put = (b: Put): Reply => [200, { revision: b.revision + 1, slug: 'am-gm' }],
  post = basePost as Record<string, unknown>,
  revisions = [] as unknown[],
} = {}) {
  const calls = {
    puts: [] as Put[],
    restores: [] as unknown[],
    gets: 0,
    publishes: [] as unknown[],
    order: [] as string[],
  };
  let current = post;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status });
      if (url.endsWith('/publish')) {
        calls.publishes.push(body);
        calls.order.push('publish');
        current = { ...current, status: 'published', published_at: '2026-10-16T08:00:00Z' };
        return json(200, { slug: 'am-gm', was_published: false, refreshed: ['/posts/am-gm', '/'], failed: [] });
      }
      if (url.endsWith('/revisions')) return json(200, { revisions });
      if (/\/revisions\/\d+$/.test(url) && init?.method === 'POST') {
        calls.restores.push(body);
        current = { ...current, title: 'Old title', revision: body.revision + 2 };
        return json(200, { revision: body.revision + 2 });
      }
      if (/\/revisions\/\d+$/.test(url)) return json(200, { html: '<p>old body</p>' });
      if (init?.method === 'PUT') {
        calls.puts.push(body);
        calls.order.push('save');
        const reply = put(body);
        if (reply === 'network') throw new TypeError('Failed to fetch');
        return json(reply[0], reply[1]);
      }
      calls.gets++;
      return json(200, { post: current, sections: [{ id: 's1', subject_id: 'math', title: 'Inequalities', sort: 0 }] });
    }),
  );
  return calls;
}

let user: ReturnType<typeof userEvent.setup>;
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const status = () => screen.getByRole('status');
const titleBox = () => screen.findByRole('textbox', { name: 'Title' });
const wait = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

describe('EditPost autosave (ADM-06)', () => {
  it('saves once, a second after the last keystroke, with every change in it', async () => {
    const calls = mockApi();
    render(<EditPost id="p1" />);
    await user.type(await titleBox(), 'AM–GM');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Section' }), 's1');
    expect(status()).toHaveTextContent('Unsaved changes');
    await wait(AUTOSAVE_MS - 100);
    expect(calls.puts).toHaveLength(0);
    await wait(200);
    await waitFor(() => expect(status()).toHaveTextContent('All changes saved'));
    expect(calls.puts).toHaveLength(1);
    expect(calls.puts[0]).toMatchObject({ revision: 3, fields: { title: 'AM–GM', section_id: 's1' } });
    expect(screen.getByText('codingspace.io/posts/am-gm')).toBeInTheDocument();
  });

  it('an edit while a save is in flight is saved next, with the new revision', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const calls = mockApi();
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const original = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<Response>;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT' && calls.puts.length === 0) await gate;
      return original(url, init);
    });
    render(<EditPost id="p1" />);
    await user.type(await titleBox(), 'A');
    await wait(AUTOSAVE_MS + 10);
    expect(status()).toHaveTextContent('Saving…');
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'B');
    release();
    await wait(AUTOSAVE_MS + 10);
    await waitFor(() => expect(calls.puts).toHaveLength(2));
    expect(calls.puts[1]).toMatchObject({ revision: 4, fields: { title: 'AB' } });
    await waitFor(() => expect(status()).toHaveTextContent('All changes saved'));
  });

  it('retries after a lost connection, and says so meanwhile', async () => {
    let fail = true;
    const calls = mockApi({ put: (b) => (fail ? 'network' : [200, { revision: b.revision + 1, slug: 'x' }]) });
    render(<EditPost id="p1" />);
    await user.type(await titleBox(), 'x');
    await wait(AUTOSAVE_MS + 10);
    await waitFor(() => expect(status()).toHaveTextContent('no connection'));
    fail = false;
    await wait(2_000);
    await waitFor(() => expect(status()).toHaveTextContent('All changes saved'));
    expect(calls.puts).toHaveLength(2);
  });

  it('signed out (12 h idle): keeps the edits, says what to do, and does not retry by itself', async () => {
    const calls = mockApi({ put: () => [401, { error: 'expired' }] });
    render(<EditPost id="p1" />);
    await user.type(await titleBox(), 'x');
    await wait(AUTOSAVE_MS + 10);
    await waitFor(() => expect(status()).toHaveTextContent('you were signed out'));
    await wait(60_000);
    expect(calls.puts).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('x');
  });

  it('a conflict stops saving: no autosave, no Save button', async () => {
    const calls = mockApi({ put: () => [409, { error: 'the post changed since revision 3' }] });
    render(<EditPost id="p1" />);
    await user.type(await titleBox(), 'x');
    await wait(AUTOSAVE_MS + 10);
    await waitFor(() => expect(status()).toHaveTextContent('changed in another tab'));
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'y');
    await wait(AUTOSAVE_MS * 5);
    expect(calls.puts).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('Ctrl/⌘+S saves at once; leaving with unsaved changes asks first', async () => {
    const calls = mockApi();
    render(<EditPost id="p1" />);
    await user.type(await titleBox(), 'x');
    const leave = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leave);
    expect(leave.defaultPrevented).toBe(true);
    act(() => void fireEvent.keyDown(window, { key: 's', metaKey: true }));
    await waitFor(() => expect(calls.puts).toHaveLength(1));
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

describe('EditPost history', () => {
  const revisions = [
    { id: 11, revision: 2, reason: 'publish', title: 'Old title', created_at: '2026-10-16T03:00:00Z' },
    { id: 10, revision: 1, reason: 'autosave', title: 'Older', created_at: '2026-10-16T02:00:00Z' },
  ];

  it('previews a version, restores it after confirming, and reloads the draft', async () => {
    const calls = mockApi({ revisions });
    render(<EditPost id="p1" />);
    await titleBox();
    await user.click(screen.getByRole('button', { name: 'History' }));
    const history = screen.getByRole('region', { name: 'History' });
    await user.click(await within(history).findByRole('button', { name: /Published\s*Old title/ }));
    expect(await within(history).findByText('old body')).toBeInTheDocument();

    await user.click(within(history).getByRole('button', { name: 'Restore…' }));
    await user.click(within(history).getByRole('button', { name: 'Restore this version' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Old title'));
    expect(calls.restores).toEqual([{ revision: 3 }]);
    expect(calls.gets).toBe(2);
    expect(screen.getByRole('alert')).toHaveTextContent('Restored.');
  });

  it('saves pending edits before restoring, so they are in the history too', async () => {
    const calls = mockApi({ revisions });
    render(<EditPost id="p1" />);
    await user.type(await titleBox(), 'unsaved');
    await user.click(screen.getByRole('button', { name: 'History' }));
    const history = screen.getByRole('region', { name: 'History' });
    await user.click(await within(history).findByRole('button', { name: /Autosaved\s*Older/ }));
    await user.click(within(history).getByRole('button', { name: 'Restore…' }));
    await user.click(within(history).getByRole('button', { name: 'Restore this version' }));
    await waitFor(() => expect(calls.restores).toHaveLength(1));
    expect(calls.puts[0]).toMatchObject({ fields: { title: 'unsaved' } });
    expect(calls.restores[0]).toEqual({ revision: 4 });
  });
});

describe('EditPost publishing', () => {
  const readyPost = {
    ...basePost,
    title: 'AM–GM',
    section_id: 's1',
    content_json: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Means' }] }] },
  };

  it('saves pending edits, then publishes that revision, and says the site is updated', async () => {
    const calls = mockApi({ post: readyPost });
    render(<EditPost id="p1" />);
    await user.type(await titleBox(), ' inequality');
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await user.click(screen.getByRole('button', { name: 'Publish now' }));
    await waitFor(() => expect(calls.publishes).toHaveLength(1));
    expect(calls.order).toEqual(['save', 'publish']);
    expect(calls.publishes[0]).toEqual({ revision: 4 });
    const note = await screen.findByText(/Published\. The site is updated\./);
    expect(within(note).getByRole('link', { name: 'View it live' })).toHaveAttribute('href', '/posts/am-gm');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument());
  });

  it('an empty draft cannot be published', async () => {
    mockApi();
    render(<EditPost id="p1" />);
    await titleBox();
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(screen.getByRole('button', { name: 'Publish now' })).toBeDisabled();
  });
});
