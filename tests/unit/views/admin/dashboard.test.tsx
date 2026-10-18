import { render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard, useDashboardRequest } from '@/views/admin/dashboard';

const push = vi.fn(async () => true);
vi.mock('next/router', () => ({ useRouter: () => ({ push }) }));

const data = {
  counts: { published: 9, drafts: 2, scheduled: 1, life: 2 },
  recent: [
    {
      id: 'p1',
      kind: 'lesson',
      slug: 'am-gm',
      title: 'AM–GM',
      subject_id: 'math',
      status: 'published',
      has_unpublished_changes: true,
      scheduled_at: null,
      published_at: '2026-10-16T08:00:00Z',
      updated_at: '2026-10-16T08:00:00Z',
    },
  ],
  activity: [
    {
      id: 7,
      action: 'post.publish',
      entity: 'post',
      entity_id: 'p1',
      meta: { slug: 'am-gm' },
      at: '2026-10-16T08:00:00Z',
      name: 'AM–GM',
    },
    {
      id: 6,
      action: 'auth.sign_in',
      entity: 'session',
      entity_id: 'self',
      meta: {},
      at: '2026-10-16T07:55:00Z',
      name: null,
    },
  ],
};

function mockFetch(handler: (url: string, init?: RequestInit) => [number, unknown]) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const [status, body] = handler(url, init);
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
afterEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
});

describe('Dashboard (ADM-02)', () => {
  it('shows the counts as links to the filtered list, and recent posts', async () => {
    mockFetch(() => [200, data]);
    render(<Dashboard />);
    const published = await screen.findByRole('link', { name: '9 Published' });
    expect(published).toHaveAttribute('href', '/admin/posts?status=published');
    expect(screen.getByRole('link', { name: '2 Life posts' })).toHaveAttribute('href', '/admin/posts?kind=life');
    // Short like the other tiles; the abbreviation is spelled out on hover.
    const qc = screen.getByRole('link', { name: /Q&C waiting$/ });
    expect(qc).toHaveAttribute('href', '/admin/questions');
    expect(within(qc).getByTitle('Questions & comments')).toHaveTextContent('Q&C');
    const recent = screen.getByRole('heading', { name: 'Recently edited' }).nextElementSibling as HTMLElement;
    expect(within(recent).getByRole('link', { name: 'AM–GM' })).toHaveAttribute('href', '/admin/posts/p1');
    expect(recent).toHaveTextContent('Unpublished changes');
  });

  it('shows the latest admin activity, linking to what still exists (ADM-15)', async () => {
    mockFetch(() => [200, data]);
    render(<Dashboard />);
    const heading = await screen.findByRole('heading', { name: 'Recent activity' });
    const list = heading.nextElementSibling as HTMLElement;
    expect(within(list).getByRole('link', { name: 'Published “AM–GM”' })).toHaveAttribute('href', '/admin/posts/p1');
    expect(list).toHaveTextContent('Signed in');
    expect(screen.getByRole('link', { name: 'All activity →' })).toHaveAttribute('href', '/admin/activity');
    expect(screen.getByRole('link', { name: 'Download all content' })).toHaveAttribute('href', '/api/admin/export');
  });

  it('uses a request the page already started, instead of asking again', async () => {
    const fetch = mockFetch(() => [500, {}]);
    render(<Dashboard request={Promise.resolve({ status: 200, data } as never)} />);
    expect(await screen.findByRole('link', { name: '9 Published' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('useDashboardRequest starts the request on mount, before the dashboard shows', async () => {
    const fetch = mockFetch(() => [200, data]);
    const { result } = renderHook(() => useDashboardRequest());
    await waitFor(() => expect(result.current).toBeInstanceOf(Promise));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0]).toBe('/api/admin/dashboard');
    await expect(result.current).resolves.toEqual({ status: 200, data });
  });

  it('“New lesson” creates a draft and opens it', async () => {
    const fetch = mockFetch((url, init) =>
      init?.method === 'POST' ? [201, { id: 'new-id', slug: 'lesson-2026-10-16' }] : [200, data],
    );
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(await screen.findByRole('button', { name: 'New lesson' }));
    expect(JSON.parse(String(fetch.mock.calls[1]![1]!.body))).toEqual({ kind: 'lesson', subject_id: 'math' });
    expect(push).toHaveBeenCalledWith('/admin/posts/new-id');
  });

  it('says so when it cannot load or create', async () => {
    mockFetch((url, init) => (init?.method === 'POST' ? [500, {}] : [500, {}]));
    const user = userEvent.setup();
    render(<Dashboard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
    await user.click(screen.getByRole('button', { name: 'New life post' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be created');
    expect(push).not.toHaveBeenCalled();
  });
});
