import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from '@/views/admin/dashboard';

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
    const recent = screen.getByRole('heading', { name: 'Recently edited' }).nextElementSibling as HTMLElement;
    expect(within(recent).getByRole('link', { name: 'AM–GM' })).toHaveAttribute('href', '/admin/posts/p1');
    expect(recent).toHaveTextContent('Unpublished changes');
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
