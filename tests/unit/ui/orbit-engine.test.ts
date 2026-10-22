import { hit, icosahedron, place, project, startOrbit, type OrbitNode } from '@/ui/orbit/engine';

const NODES: OrbitNode[] = [
  { id: 'math', name: 'Math', glyph: '∑', color: '#18e4ec' },
  { id: 'physics', name: 'Physics', glyph: 'Ψ', color: '#9b8cff' },
  { id: 'coding', name: 'Coding', glyph: '</>', color: '#ffb84a' },
  { id: 'it', name: 'IT', glyph: '⌘', color: '#7dff9b' },
];

describe('orbit geometry', () => {
  it('builds an icosahedron: 12 corners, 30 edges', () => {
    const { v, e } = icosahedron();
    expect(v).toHaveLength(12);
    expect(e).toHaveLength(30);
  });

  it('projects the centre to the middle of the box', () => {
    expect(project([0, 0, 0], 400, 400)).toEqual([200, 200, 1]);
  });

  it('places every subject inside the box, and they move over time', () => {
    const now = place(NODES, 0, 400, 400);
    const later = place(NODES, 2, 400, 400);
    expect(now.map((p) => p.id)).toEqual(['math', 'physics', 'coding', 'it']);
    for (const p of [...now, ...later]) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(400);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(400);
    }
    expect(later[0]!.x).not.toBeCloseTo(now[0]!.x);
  });

  it('never lets two subjects overlap, with up to six of them on a phone-sized orbit', () => {
    const six = [...NODES, ...NODES].slice(0, 6).map((n, i) => ({ ...n, id: `${n.id}${i}` }));
    for (let n = 2; n <= 6; n++)
      for (let t = 0; t < 30; t += 0.1) {
        const placed = place(six.slice(0, n), t, 380, 380);
        for (const a of placed)
          for (const b of placed) {
            // A hexagon is 48px across, and its name sits under it.
            if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(60 * Math.max(a.f, b.f));
          }
      }
  });

  it('finds the subject under the pointer, the nearer one when two overlap', () => {
    const placed = [
      { id: 'far', x: 100, y: 100, f: 0.8 },
      { id: 'near', x: 105, y: 100, f: 1.2 },
    ];
    expect(hit(placed, 102, 101)).toBe('near');
    expect(hit(placed, 300, 300)).toBeNull();
  });
});

describe('startOrbit: runs only when someone can see it', () => {
  let observers: { cb: IntersectionObserverCallback; disconnect: ReturnType<typeof vi.fn> }[];
  let raf: ReturnType<typeof vi.fn>;
  let caf: ReturnType<typeof vi.fn>;

  function canvas() {
    const el = document.createElement('canvas');
    const ctx = new Proxy(
      {},
      {
        get: (_t, k) =>
          k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : typeof k === 'string' ? () => {} : undefined,
        set: () => true,
      },
    );
    el.getContext = (() => ctx) as never;
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400 }) as DOMRect;
    return el;
  }

  beforeEach(() => {
    observers = [];
    raf = vi.fn(() => 1);
    caf = vi.fn();
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', caf);
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        disconnect = vi.fn();
        constructor(cb: IntersectionObserverCallback) {
          observers.push({ cb, disconnect: this.disconnect });
        }
        observe() {}
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const scrolled = (visible: boolean) =>
    observers[0]!.cb([{ isIntersecting: visible } as IntersectionObserverEntry], {} as IntersectionObserver);

  it('with motion off: one still frame, no animation loop', () => {
    startOrbit(canvas(), { nodes: NODES, motion: false, font: 'monospace' });
    expect(raf).not.toHaveBeenCalled();
  });

  it('with motion on: animates, pauses off screen, resumes on screen', () => {
    startOrbit(canvas(), { nodes: NODES, motion: true, font: 'monospace' });
    expect(raf).toHaveBeenCalledTimes(1);
    scrolled(false);
    expect(caf).toHaveBeenCalled();
    scrolled(true);
    expect(raf).toHaveBeenCalledTimes(2);
  });

  it('turning motion off stops the loop; stop() removes everything', () => {
    const orbit = startOrbit(canvas(), { nodes: NODES, motion: true, font: 'monospace' });
    orbit.setMotion(false);
    expect(caf).toHaveBeenCalled();
    orbit.stop();
    expect(observers[0]!.disconnect).toHaveBeenCalled();
    orbit.setMotion(true);
    expect(raf).toHaveBeenCalledTimes(1);
  });

  it('hovering a subject reports it, and clicking opens it', () => {
    const onHover = vi.fn();
    const onSelect = vi.fn();
    const el = canvas();
    startOrbit(el, { nodes: NODES, motion: false, font: 'monospace', onHover, onSelect });
    const math = place(NODES, 0, 400, 400)[0]!;
    el.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 200 }) as PointerEvent);
    el.dispatchEvent(new MouseEvent('pointermove', { clientX: math.x, clientY: math.y }) as PointerEvent);
    expect(onHover).toHaveBeenLastCalledWith('math');
    el.dispatchEvent(new MouseEvent('click'));
    expect(onSelect).toHaveBeenCalledWith('math');
    el.dispatchEvent(new MouseEvent('pointerleave'));
    expect(onHover).toHaveBeenLastCalledWith(null);
  });
});
