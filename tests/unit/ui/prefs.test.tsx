import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const play = { click: vi.fn(), hover: vi.fn(), assemble: vi.fn() };
vi.mock('@arwes/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arwes/react')>();
  return {
    ...actual,
    useBleeps: () => ({ click: { play: play.click }, hover: { play: play.hover }, assemble: { play: play.assemble } }),
  };
});
// The canvas backdrop is mocked: we test *when* it mounts, not Arwes' drawing.
vi.mock('@/ui/arwes/backdrop-canvas', () => ({ default: () => <canvas data-testid="backdrop-canvas" /> }));

import { Backdrop, TopBar, UiRoot, useSound } from '@/ui';

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
    const toggle = screen.getByRole('button', { name: /sound off/i });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'probe' }));
    expect(play.hover).not.toHaveBeenCalled();
  });

  it('turning sound on confirms with a click and enables other sounds', async () => {
    render(
      <UiRoot motion={false}>
        <TopBar />
        <HoverProbe />
      </UiRoot>,
    );
    await userEvent.click(screen.getByRole('button', { name: /sound off/i }));
    expect(play.click).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /sound on/i })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'probe' }));
    expect(play.hover).toHaveBeenCalledTimes(1);
  });

  it('turning sound off again plays no confirmation', async () => {
    render(
      <UiRoot motion={false}>
        <TopBar />
      </UiRoot>,
    );
    await userEvent.click(screen.getByRole('button', { name: /sound off/i }));
    await userEvent.click(screen.getByRole('button', { name: /sound on/i }));
    expect(play.click).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /sound off/i })).toBeInTheDocument();
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

describe('<Backdrop> (ADR 0001 finding 7)', () => {
  it('waits for the browser to be idle before mounting the canvas', async () => {
    let idle: (() => void) | undefined;
    window.requestIdleCallback = vi.fn((cb: IdleRequestCallback) => {
      idle = () => cb({} as IdleDeadline);
      return 1;
    });
    window.cancelIdleCallback = vi.fn();

    render(
      <UiRoot motion={false}>
        <Backdrop />
      </UiRoot>,
    );
    expect(screen.getByTestId('backdrop')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByTestId('backdrop-canvas')).toBeNull();

    await act(async () => idle?.());
    expect(await screen.findByTestId('backdrop-canvas')).toBeInTheDocument();
  });
});
