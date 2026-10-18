import { act, screen, waitFor } from '@testing-library/react';
import { render } from '../../support/subjects';

type Options = { motion: boolean; nodes: { id: string }[] };
const startOrbit = vi.fn<(canvas: HTMLCanvasElement, options: Options) => { setMotion: () => void; stop: () => void }>(
  () => ({ setMotion: vi.fn(), stop: vi.fn() }),
);
vi.mock('@/ui/orbit/engine', () => ({ startOrbit }));
vi.mock('next/router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { OrbitHero, UiRoot } from '@/ui';

let observe: (visible: boolean) => void;
let idle: (() => void) | null;

beforeEach(() => {
  startOrbit.mockClear();
  idle = null;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IntersectionObserverCallback) {
        observe = (visible) =>
          cb([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('requestIdleCallback', (cb: () => void) => {
    idle = cb;
    return 1;
  });
  vi.stubGlobal('cancelIdleCallback', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe('<OrbitHero> (04 M6)', () => {
  it('is decoration: hidden from screen readers, with no focusable parts', () => {
    render(
      <UiRoot motion={false}>
        <OrbitHero />
      </UiRoot>,
    );
    const orbit = screen.getByTestId('orbit');
    expect(orbit).toHaveAttribute('aria-hidden', 'true');
    expect(orbit.querySelector('a, button, [tabindex]')).toBeNull();
  });

  it('downloads the engine only once the hero is on screen and the browser is idle', async () => {
    render(
      <UiRoot motion>
        <OrbitHero />
      </UiRoot>,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(startOrbit).not.toHaveBeenCalled();
    act(() => observe(true));
    expect(startOrbit).not.toHaveBeenCalled();
    act(() => idle!());
    await waitFor(() => expect(startOrbit).toHaveBeenCalledTimes(1));
    expect(startOrbit.mock.calls[0]![1]).toMatchObject({ motion: true });
    expect(startOrbit.mock.calls[0]![1].nodes.map((n) => n.id)).toEqual(['math', 'physics', 'coding', 'it']);
  });

  it('with motion off it starts still, and the clock says so', async () => {
    render(
      <UiRoot motion={false}>
        <OrbitHero />
      </UiRoot>,
    );
    act(() => observe(true));
    act(() => idle!());
    await waitFor(() => expect(startOrbit).toHaveBeenCalled());
    expect(startOrbit.mock.calls[0]![1]).toMatchObject({ motion: false });
    expect(screen.getByTestId('orbit')).toHaveTextContent('T+PAUSED');
  });

  it('stops the engine when the page goes away', async () => {
    const { unmount } = render(
      <UiRoot motion>
        <OrbitHero />
      </UiRoot>,
    );
    act(() => observe(true));
    act(() => idle!());
    await waitFor(() => expect(startOrbit).toHaveBeenCalled());
    const orbit = startOrbit.mock.results[0]!.value;
    unmount();
    expect(orbit.stop).toHaveBeenCalled();
  });
});
