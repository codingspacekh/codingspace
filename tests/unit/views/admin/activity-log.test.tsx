import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActivityLog } from '@/views/admin/activity-log';

const ev = (id: number, action: string, name: string | null = null) => ({
  id,
  action,
  entity: action.split('.')[0],
  entity_id: `e${id}`,
  meta: {},
  at: '2026-10-17T09:00:00Z',
  name,
});

function mockFetch(pages: Record<string, [number, unknown]>) {
  const fetch = vi.fn(async (url: string) => {
    const [status, body] = pages[url] ?? [404, {}];
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
afterEach(() => vi.unstubAllGlobals());

// 03 ADM-15: the whole audit log, newest first, 50 at a time.
describe('ActivityLog', () => {
  it('lists the events and loads older ones after the last', async () => {
    const fetch = mockFetch({
      '/api/admin/activity': [
        200,
        { events: [ev(9, 'post.publish', 'Vectors'), ev(8, 'media.add', 'tri.png')], more: true },
      ],
      '/api/admin/activity?before=8': [200, { events: [ev(3, 'section.create', 'Inequalities')], more: false }],
    });
    const user = userEvent.setup();
    render(<ActivityLog />);
    expect(await screen.findByRole('link', { name: 'Published “Vectors”' })).toHaveAttribute('href', '/admin/posts/e9');
    expect(screen.getByRole('link', { name: 'Uploaded the file “tri.png”' })).toHaveAttribute('href', '/admin/media');

    await user.click(screen.getByRole('button', { name: 'Older' }));
    expect(await screen.findByRole('link', { name: 'Created the section “Inequalities”' })).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith('/api/admin/activity?before=8', expect.anything());
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Older' })).not.toBeInTheDocument();
  });

  it('says so when it is empty or cannot load', async () => {
    mockFetch({ '/api/admin/activity': [200, { events: [], more: false }] });
    const { unmount } = render(<ActivityLog />);
    expect(await screen.findByText('Nothing yet.')).toBeInTheDocument();
    unmount();
    mockFetch({ '/api/admin/activity': [500, {}] });
    render(<ActivityLog />);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
  });
});
