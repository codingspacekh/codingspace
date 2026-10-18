import { act, render } from '@testing-library/react';
import mitt from 'next/dist/shared/lib/mitt';

const events = mitt();
const singleton = vi.hoisted(() => ({ pathname: '/posts/[slug]' }));
vi.mock('next/router', () => ({ default: singleton, useRouter: () => ({ events }) }));
import { VisitTracker } from '@/ui/visit-tracker';

const route = (name: string, url: string, shallow = false) => act(() => events.emit(name, url, { shallow }));

let fetch: ReturnType<typeof vi.fn>;
let beacon: ReturnType<typeof vi.fn>;
let visibility: DocumentVisibilityState;
let now: number;

const views = () => fetch.mock.calls.map(([, init]) => JSON.parse(init.body as string));
const times = () => beacon.mock.calls.map(([, body]) => JSON.parse(body as string));
const setVisibility = (v: DocumentVisibilityState) => {
  visibility = v;
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
};

beforeEach(() => {
  fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  beacon = vi.fn().mockReturnValue(true);
  vi.stubGlobal('fetch', fetch);
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon });
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  vi.spyOn(document, 'referrer', 'get').mockReturnValue('https://www.google.com/search?q=x');
  now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  singleton.pathname = '/posts/[slug]';
  window.history.replaceState(null, '', '/posts/am-gm');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('VisitTracker (v1.1 analytics)', () => {
  it('sends the first page with its referrer, later pages without', () => {
    render(<VisitTracker />);
    route('routeChangeStart', '/study/math');
    route('routeChangeComplete', '/study/math?tab=1');
    const [first, second] = views();
    expect(first).toMatchObject({ path: '/posts/am-gm', referrer: 'https://www.google.com/search?q=x' });
    expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toEqual({ id: expect.any(String), path: '/study/math' });
    expect(second.id).not.toBe(first.id);
    expect(fetch.mock.calls[0]![0]).toBe('/api/visit');
    expect(fetch.mock.calls[0]![1]).toMatchObject({ method: 'POST', keepalive: true });
  });

  it('sends the time on screen when the page is left, not counting hidden time', () => {
    render(<VisitTracker />);
    const id = views()[0].id;
    now = 20_000;
    setVisibility('hidden');
    expect(times()).toEqual([{ id, seconds: 20 }]);
    now = 500_000; // hidden for a long time: not counted
    setVisibility('visible');
    now = 510_000;
    route('routeChangeStart', '/projects');
    expect(times()).toEqual([
      { id, seconds: 20 },
      { id, seconds: 30 },
    ]);
    // Nothing new to say on pagehide once the page is gone.
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(times()).toHaveLength(2);
  });

  it('falls back to fetch when sendBeacon is refused', () => {
    beacon.mockReturnValue(false);
    render(<VisitTracker />);
    now = 5_000;
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(views().at(-1)).toEqual({ id: views()[0].id, seconds: 5 });
  });

  it('never sends the admin, error pages, shallow changes or under a second', () => {
    window.history.replaceState(null, '', '/admin/posts');
    render(<VisitTracker />);
    expect(fetch).not.toHaveBeenCalled();

    singleton.pathname = '/404';
    route('routeChangeComplete', '/posts/missing');
    expect(fetch).not.toHaveBeenCalled();

    singleton.pathname = '/posts/[slug]';
    route('routeChangeComplete', '/posts/real');
    route('routeChangeComplete', '/posts/real?x=1', true);
    expect(views()).toHaveLength(1);
    now = 400;
    route('routeChangeStart', '/');
    expect(beacon).not.toHaveBeenCalled();
  });
});
