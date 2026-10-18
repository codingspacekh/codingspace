import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnalyticsDashboard } from '@/views/admin/analytics';
import type { Analytics } from '@/lib/analytics';

const day = (d: string, views: number, visitors: number, seconds = 0, timed = 0) => ({
  day: d,
  views,
  visitors,
  seconds,
  timed,
});

const DATA: Analytics = {
  today: '2026-10-18',
  days: [day('2026-10-16', 0, 0), day('2026-10-17', 6, 4, 300, 5), day('2026-10-18', 4, 2, 100, 3)],
  previous: { views: 5, visitors: 4, seconds: 200, timed: 4 },
  months: [{ month: '2026-10', views: 15, visitors: 10 }],
  pages: [
    {
      path: '/posts/am-gm',
      title: 'The AM-GM inequality',
      subject: 'math',
      views: 7,
      visitors: 4,
      seconds: 280,
      timed: 4,
    },
    { path: '/', title: null, subject: null, views: 3, visitors: 3, seconds: 0, timed: 0 },
  ],
  subjects: [{ subject: 'math', views: 7 }],
  sources: [
    { source: null, views: 6 },
    { source: 'Google', views: 4 },
  ],
  devices: [
    { device: 'mobile', views: 8 },
    { device: 'desktop', views: 2 },
  ],
  countries: [{ country: 'KH', views: 10 }],
};

function mockFetch(byUrl: Record<string, [number, unknown]>) {
  const fetch = vi.fn(async (url: string) => {
    const [status, body] = byUrl[url] ?? [404, {}];
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
afterEach(() => vi.unstubAllGlobals());

describe('AnalyticsDashboard (v1.1)', () => {
  it('shows totals with the change, the days, top pages and breakdowns', async () => {
    mockFetch({ '/api/admin/analytics?days=30': [200, DATA] });
    render(<AnalyticsDashboard />);
    const totals = await screen.findByRole('list', { name: 'Totals' });
    const tile = (label: string) => within(totals).getByText(label).closest('li')!;
    expect(within(tile('Visitors')).getByText('6')).toBeInTheDocument();
    expect(within(tile('Visitors')).getByText('+50 % on the period before')).toBeInTheDocument();
    expect(within(tile('Page views')).getByText('10')).toBeInTheDocument();
    expect(within(tile('Average time on a page')).getByText('50 s')).toBeInTheDocument();
    expect(within(tile('Pages per visitor')).getByText('1.7')).toBeInTheDocument();

    const perDay = screen.getByRole('table', { name: 'Visitors and page views per day' });
    expect(within(perDay).getAllByRole('row')).toHaveLength(4);
    expect(within(perDay).getByRole('rowheader', { name: '17 Oct' })).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'The AM-GM inequality' })).toHaveAttribute('href', '/posts/am-gm');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByText('1 min 10 s')).toBeInTheDocument();

    expect(within(screen.getByRole('region', { name: 'Subjects' })).getByText('Math')).toBeInTheDocument();
    const sources = screen.getByRole('region', { name: 'Where visitors come from' });
    expect(within(sources).getByText('Direct or unknown')).toBeInTheDocument();
    expect(within(sources).getByText('Google')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Devices' })).getByText('Phone')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Countries' })).getByText('Cambodia')).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'October 2026' })).toBeInTheDocument();
  });

  it('switches the period', async () => {
    const fetch = mockFetch({
      '/api/admin/analytics?days=30': [200, DATA],
      '/api/admin/analytics?days=7': [200, { ...DATA, pages: [], subjects: [] }],
    });
    const user = userEvent.setup();
    render(<AnalyticsDashboard />);
    await screen.findByText('The AM-GM inequality');
    expect(screen.getByRole('button', { name: 'Last 30 days' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Last 7 days' }));
    expect(await screen.findByText('No visits in this period yet.')).toBeInTheDocument();
    expect(screen.getByText('No lessons or subject pages read yet.')).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith('/api/admin/analytics?days=7', expect.anything());
  });

  it('says so when nothing can be loaded', async () => {
    mockFetch({});
    render(<AnalyticsDashboard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
  });
});
