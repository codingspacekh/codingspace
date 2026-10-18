import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PostListItem } from '@/lib/admin-posts';
import { PostsBrowser } from '@/views/admin/posts-browser';
import { render } from '../../../support/subjects';

const post = (over: Partial<PostListItem>): PostListItem => ({
  id: 'p1',
  kind: 'lesson',
  slug: 'am-gm',
  title: 'AM–GM',
  subject_id: 'math',
  status: 'published',
  has_unpublished_changes: false,
  scheduled_at: null,
  published_at: '2026-10-16T08:00:00Z',
  updated_at: '2026-10-16T08:00:00Z',
  ...over,
});

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
});

const rows = [
  post({}),
  post({ id: 'p2', slug: 'cauchy', title: 'Cauchy', has_unpublished_changes: true }),
  post({ id: 'p3', slug: 'draft-one', title: 'Draft one', status: 'draft', published_at: null }),
];

describe('PostsBrowser', () => {
  it('lists posts with their status, and View only for live ones', async () => {
    mockFetch(() => [200, { posts: rows }]);
    render(<PostsBrowser filters={{}} onFilters={vi.fn()} />);
    const table = await screen.findByRole('table');
    const [, first, second, third] = within(table).getAllByRole('row');
    expect(first).toHaveTextContent('Published');
    expect(second).toHaveTextContent('Unpublished changes');
    expect(third).toHaveTextContent('Draft');
    expect(within(first!).getByRole('link', { name: /View AM–GM/ })).toHaveAttribute('href', '/posts/am-gm');
    expect(within(third!).queryByRole('link', { name: /View/ })).toBeNull();
    expect(within(first!).getByRole('link', { name: 'Edit AM–GM' })).toHaveAttribute('href', '/admin/posts/p1');
  });

  it('asks the server with the current filters, and passes new ones up', async () => {
    const fetch = mockFetch(() => [200, { posts: [] }]);
    const onFilters = vi.fn();
    const user = userEvent.setup();
    render(<PostsBrowser filters={{ subject: 'math', status: 'draft' }} onFilters={onFilters} />);
    expect(await screen.findByText('No posts match these filters.')).toBeInTheDocument();
    expect(fetch.mock.calls[0]![0]).toBe('/api/admin/posts?subject=math&status=draft');

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'cauchy');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Type' }), 'lesson');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onFilters).toHaveBeenCalledWith({ q: 'cauchy', kind: 'lesson', subject: 'math', status: 'draft' });
  });

  it('deletes only after confirming, and can be cancelled', async () => {
    const fetch = mockFetch((url, init) =>
      init?.method === 'DELETE' ? [200, { slug: 'draft-one' }] : [200, { posts: rows }],
    );
    const user = userEvent.setup();
    render(<PostsBrowser filters={{}} onFilters={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Delete AM–GM' }));
    const confirm = screen.getByRole('group', { name: 'Confirm delete' });
    expect(confirm).toHaveFocus();
    expect(confirm).toHaveTextContent('which students can see now');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(fetch.mock.calls.filter(([, i]) => i?.method === 'DELETE')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Delete Draft one' }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Deleted “Draft one”.');
    expect(fetch).toHaveBeenCalledWith('/api/admin/posts/p3', expect.objectContaining({ method: 'DELETE' }));
    expect(screen.queryByText('Draft one')).toBeNull();
  });

  it('says when a delete is refused, and keeps the row', async () => {
    mockFetch((url, init) => (init?.method === 'DELETE' ? [404, { error: 'post not found' }] : [200, { posts: rows }]));
    const user = userEvent.setup();
    render(<PostsBrowser filters={{}} onFilters={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Delete Cauchy' }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Could not delete “Cauchy”: post not found.');
    expect(screen.getByText('Cauchy')).toBeInTheDocument();
  });

  it('shows an error when the list cannot load', async () => {
    mockFetch(() => [500, { error: 'server_error' }]);
    render(<PostsBrowser filters={{}} onFilters={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
  });
});
