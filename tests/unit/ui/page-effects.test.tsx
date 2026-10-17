import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import mitt from 'next/dist/shared/lib/mitt';

const play = { click: vi.fn(), hover: vi.fn(), typing: vi.fn(), deploy: vi.fn(), transition: vi.fn(), start: vi.fn() };
vi.mock('@/ui/arwes/bleeps', () => ({
  createSiteBleeps: () => ({ bleeps: Object.fromEntries(Object.entries(play).map(([k, f]) => [k, { play: f }])) }),
}));
const events = mitt();
let pathname = '/';
vi.mock('next/router', () => ({ useRouter: () => ({ events, pathname }) }));
import { PageEffects, UiRoot } from '@/ui';
import { ARRIVE_MS, LOADER_MS, loaderFor } from '@/ui/page-effects';

const html = document.documentElement;
const route = (name: string, url: string, shallow = false) => act(() => events.emit(name, url, { shallow }));

function setup({ motion = true, sound = false } = {}) {
  if (sound) window.localStorage.setItem('cs-prefs', JSON.stringify({ sound: true, invited: true }));
  return render(
    <UiRoot motion={motion}>
      <main>
        <h1>Lesson</h1>
        <a href="/a">A link</a>
        <button type="button">A button</button>
        <p>Plain text</p>
      </main>
      <PageEffects />
    </UiRoot>,
  );
}

beforeEach(() => {
  Object.values(play).forEach((f) => f.mockClear());
  pathname = '/';
  delete html.dataset.transition;
});

describe('page changes (after soulextract.com)', () => {
  it('every page change: loading screen, then the new page comes in, then the page is left alone', () => {
    vi.useFakeTimers();
    setup();
    route('routeChangeStart', '/projects');
    expect(html.dataset.transition).toBe('loading');
    expect(screen.getByTestId('page-loader')).toHaveTextContent('Loading Projects');
    route('routeChangeComplete', '/projects');
    act(() => vi.advanceTimersByTime(LOADER_MS));
    expect(html.dataset.transition).toBe('in');
    act(() => vi.advanceTimersByTime(ARRIVE_MS));
    expect(html.dataset.transition).toBeUndefined();
    vi.useRealTimers();
  });

  it('a subject or a lesson shows a loading screen first, for at least LOADER_MS, then arrives', () => {
    vi.useFakeTimers();
    setup({ sound: true });
    route('routeChangeStart', '/study/physics');
    expect(html.dataset.transition).toBe('loading');
    expect(screen.getByTestId('page-loader')).toHaveTextContent('Loading Physics');
    expect(screen.getByTestId('page-loader')).toHaveClass('c-violet');
    // The page is ready quickly: the loading screen still stays up for the rest of LOADER_MS.
    act(() => vi.advanceTimersByTime(100));
    route('routeChangeComplete', '/study/physics');
    expect(html.dataset.transition).toBe('loading');
    act(() => vi.advanceTimersByTime(LOADER_MS - 101));
    expect(html.dataset.transition).toBe('loading');
    act(() => vi.advanceTimersByTime(1));
    expect(html.dataset.transition).toBe('in');
    expect(screen.queryByTestId('page-loader')).toBeNull();
    act(() => vi.advanceTimersByTime(ARRIVE_MS));
    expect(html.dataset.transition).toBeUndefined();
    vi.useRealTimers();
  });

  it('a slow page arrives as soon as it is ready', () => {
    vi.useFakeTimers();
    setup();
    route('routeChangeStart', '/posts/am-gm-inequality');
    expect(screen.getByTestId('page-loader')).toHaveTextContent('Loading Lesson');
    act(() => vi.advanceTimersByTime(LOADER_MS + 500));
    expect(html.dataset.transition).toBe('loading');
    route('routeChangeComplete', '/posts/am-gm-inequality');
    expect(html.dataset.transition).toBe('in');
    vi.useRealTimers();
  });

  it('the loading screen names where it is going, in the subject colour', () => {
    expect(loaderFor('/study/math')).toEqual({ label: 'Math', color: 'cyan' });
    expect(loaderFor('/study/it?x=1#arrays')).toEqual({ label: 'IT', color: 'lime' });
    expect(loaderFor('/posts/am-gm')).toEqual({ label: 'Lesson', color: 'cyan' });
    expect(loaderFor('/')).toEqual({ label: 'Home', color: 'cyan' });
    expect(loaderFor('/search?q=cauchy')).toEqual({ label: 'Search', color: 'cyan' });
    expect(loaderFor('/projects/')).toEqual({ label: 'Projects', color: 'cyan' });
    expect(loaderFor('/author')).toEqual({ label: 'Author', color: 'cyan' });
    expect(loaderFor('/study/nope')).toEqual({ label: 'Page', color: 'cyan' });
  });

  it('with motion off, nothing animates', () => {
    setup({ motion: false });
    route('routeChangeStart', '/projects');
    expect(html.dataset.transition).toBeUndefined();
    route('routeChangeComplete', '/projects');
    expect(html.dataset.transition).toBeUndefined();
    route('routeChangeStart', '/study/math');
    expect(html.dataset.transition).toBeUndefined();
    expect(screen.queryByTestId('page-loader')).toBeNull();
  });

  it('a failed navigation puts the page back', () => {
    setup();
    route('routeChangeStart', '/projects');
    route('routeChangeError', '/projects');
    expect(html.dataset.transition).toBeUndefined();
    route('routeChangeStart', '/study/math');
    route('routeChangeError', '/study/math');
    expect(html.dataset.transition).toBeUndefined();
    expect(screen.queryByTestId('page-loader')).toBeNull();
  });

  it('nothing happens in the admin, or for shallow changes (filters in the address bar)', () => {
    setup({ sound: true });
    route('routeChangeStart', '/admin/posts');
    route('routeChangeStart', '/search?q=x', true);
    expect(html.dataset.transition).toBeUndefined();
    expect(play.transition).not.toHaveBeenCalled();
  });

  it('with sound on: a whoosh on leaving, the deploy and typing sounds on arriving', async () => {
    setup({ sound: true });
    route('routeChangeStart', '/projects');
    route('routeChangeComplete', '/projects');
    await waitFor(() => expect(play.transition).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(play.deploy).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(play.typing).toHaveBeenCalledTimes(1));
  });

  it('with sound off, no sound at all', async () => {
    setup();
    route('routeChangeStart', '/projects');
    route('routeChangeComplete', '/projects');
    fireEvent.click(screen.getByRole('button', { name: 'A button' }));
    await new Promise((r) => setTimeout(r, 200));
    expect(Object.values(play).every((f) => f.mock.calls.length === 0)).toBe(true);
  });
});

describe('interface sounds', () => {
  it('a tick when the pointer reaches a link or button (once per element), a click when used', async () => {
    setup({ sound: true });
    const link = screen.getByRole('link', { name: 'A link' });
    fireEvent.pointerOver(link, { pointerType: 'mouse' });
    fireEvent.pointerOver(link.firstChild ?? link, { pointerType: 'mouse' });
    fireEvent.pointerOver(screen.getByText('Plain text'), { pointerType: 'mouse' });
    await waitFor(() => expect(play.hover).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'A button' }));
    await waitFor(() => expect(play.click).toHaveBeenCalledTimes(1));
  });

  it('no hover tick for touch', async () => {
    setup({ sound: true });
    fireEvent.pointerOver(screen.getByRole('link', { name: 'A link' }), { pointerType: 'touch' });
    await new Promise((r) => setTimeout(r, 50));
    expect(play.hover).not.toHaveBeenCalled();
  });
});

describe('the one-time sound offer', () => {
  it('appears after a moment; "Turn on sound" switches sound on, plays the start chime and never asks again', async () => {
    const { unmount } = setup();
    // Present but hidden at first (an unobtrusive offer, not a gate).
    expect(document.querySelector('.sound-invite')).toHaveAttribute('hidden');
    await waitFor(() => expect(screen.getByRole('region', { name: 'Sound' })).toBeVisible(), { timeout: 2500 });
    await userEvent.click(screen.getByRole('button', { name: 'Turn on sound' }));
    await waitFor(() => expect(play.start).toHaveBeenCalled());
    expect(JSON.parse(window.localStorage.getItem('cs-prefs')!)).toEqual({ invited: true, sound: true });
    expect(screen.queryByRole('region', { name: 'Sound' })).toBeNull();
    unmount();
    setup();
    expect(document.querySelector('.sound-invite')).toBeNull();
  });

  it('"No thanks" is remembered too, and sound stays off', async () => {
    setup();
    await waitFor(() => expect(screen.getByRole('region', { name: 'Sound' })).toBeVisible(), { timeout: 2500 });
    await userEvent.click(screen.getByRole('button', { name: 'No thanks' }));
    expect(JSON.parse(window.localStorage.getItem('cs-prefs')!)).toEqual({ invited: true });
    expect(play.start).not.toHaveBeenCalled();
  });

  it('is never offered in the admin', () => {
    pathname = '/admin/posts';
    setup();
    expect(document.querySelector('.sound-invite')).toBeNull();
  });
});
