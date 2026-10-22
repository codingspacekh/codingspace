import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const play = { click: vi.fn(), hover: vi.fn(), start: vi.fn() };
// Sound loads lazily (src/ui/arwes/bleeps.ts); the mock stands in for Arwes's audio.
vi.mock('@/ui/arwes/bleeps', () => ({
  createSiteBleeps: () => ({
    bleeps: { click: { play: play.click }, hover: { play: play.hover }, start: { play: play.start } },
  }),
}));
import { act } from 'react';
import { Backdrop, TopBar, UiRoot, usePrefs, useSound } from '@/ui';
import { getPrefs, setPref } from '@/ui/prefs-store';

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

beforeEach(() => {
  Object.values(play).forEach((f) => f.mockClear());
  mockReducedMotion(false);
});

describe('motion preference (PUB-11, NFR-A11Y-1)', () => {
  it('turns motion off when the OS asks for reduced motion', () => {
    mockReducedMotion(true);
    render(<UiRoot>x</UiRoot>);
    expect(document.documentElement.dataset.motion).toBe('off');
  });

  it('keeps motion on otherwise', () => {
    render(<UiRoot>x</UiRoot>);
    expect(document.documentElement.dataset.motion).toBe('on');
  });
});

describe('remembered choices (PUB-11)', () => {
  function Reading() {
    const { reading, animate, toggleReading } = usePrefs();
    return (
      <button type="button" aria-pressed={reading} onClick={toggleReading}>
        Reading mode {animate ? '(animated)' : '(still)'}
      </button>
    );
  }

  it('a stored choice beats the OS setting, and survives a new page', () => {
    mockReducedMotion(true);
    window.localStorage.setItem('cs-prefs', JSON.stringify({ motion: true, sound: true }));
    render(
      <UiRoot>
        <TopBar />
      </UiRoot>,
    );
    expect(screen.getByRole('button', { name: 'Motion' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Sound' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggling stores the choice', async () => {
    render(
      <UiRoot>
        <TopBar />
      </UiRoot>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Motion' }));
    expect(JSON.parse(window.localStorage.getItem('cs-prefs')!)).toEqual({ motion: false });
    expect(document.documentElement.dataset.motion).toBe('off');
  });

  it('reading mode stops all motion and marks the page, and is remembered', async () => {
    render(
      <UiRoot>
        <Reading />
      </UiRoot>,
    );
    const button = screen.getByRole('button', { name: /reading mode/i });
    expect(button).toHaveTextContent('(animated)');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveTextContent('(still)');
    expect(document.documentElement.dataset.reading).toBe('on');
    expect(document.documentElement.dataset.motion).toBe('off');
    expect(getPrefs().reading).toBe(true);
  });

  it('ignores a broken stored value, and still works when storage is blocked', () => {
    window.localStorage.setItem('cs-prefs', '{not json');
    expect(getPrefs()).toEqual({ motion: true, sound: false, reading: false, invited: false });
    window.localStorage.setItem('cs-prefs', JSON.stringify({ motion: 'yes', sound: 1 }));
    expect(getPrefs()).toEqual({ motion: true, sound: false, reading: false, invited: false });

    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    act(() => setPref('sound', true));
    expect(getPrefs().sound).toBe(true);
    setItem.mockRestore();
    act(() => setPref('sound', false));
  });
});

describe('sound (PUB-11): off by default, opt-in', () => {
  function HoverProbe() {
    const sound = useSound();
    return (
      <button type="button" onClick={() => sound('hover')}>
        probe
      </button>
    );
  }

  it('starts off and plays nothing', async () => {
    render(
      <UiRoot motion={false}>
        <TopBar />
        <HoverProbe />
      </UiRoot>,
    );
    const toggle = screen.getByRole('button', { name: 'Sound' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'probe' }));
    expect(play.hover).not.toHaveBeenCalled();
  });

  it('turning sound on confirms with the start chime and enables other sounds', async () => {
    render(
      <UiRoot motion={false}>
        <TopBar />
        <HoverProbe />
      </UiRoot>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sound' }));
    await waitFor(() => expect(play.start).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Sound' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'probe' }));
    await waitFor(() => expect(play.hover).toHaveBeenCalledTimes(1));
  });

  it('turning sound off again plays no confirmation', async () => {
    render(
      <UiRoot motion={false}>
        <TopBar />
      </UiRoot>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sound' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sound' }));
    await waitFor(() => expect(play.start).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20)); // no second chime
    expect(play.start).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Sound' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('the logo links home', () => {
    render(
      <UiRoot motion={false}>
        <TopBar />
      </UiRoot>,
    );
    expect(screen.getByRole('link', { name: /codingspace/i })).toHaveAttribute('href', '/');
  });
});

describe('<Backdrop>', () => {
  // M2 Lighthouse gate: the animated Arwes canvas cost ~1.5 s of main-thread time on a phone.
  // The grid is now CSS (as in the approved prototype): decorative, hidden, no script at all.
  it('is a decorative CSS layer with no canvas, and circuit streaks that only CSS moves', () => {
    window.requestIdleCallback = vi.fn();
    const { container } = render(
      <UiRoot>
        <Backdrop />
      </UiRoot>,
    );
    expect(screen.getByTestId('backdrop')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelectorAll('.ui-circuit path').length).toBeGreaterThan(4);
    expect(container.querySelectorAll('.ui-streak')).toHaveLength(6);
    expect(window.requestIdleCallback).not.toHaveBeenCalled();
  });
});
