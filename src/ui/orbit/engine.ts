/**
 * The orbit hero (04 M6), ported from the approved prototype: a wireframe icosahedron with
 * the four subjects circling it on tilted rings. Plain canvas, no React, no Arwes: this file
 * is downloaded only after the page is idle and the hero is on screen (./orbit-hero.tsx).
 *
 * It never runs when nobody can see it: the loop stops when the canvas leaves the viewport
 * or the tab is hidden, and with motion off it draws a single still frame (redrawn only on
 * hover).
 */

export type OrbitNode = { id: string; name: string; glyph: string; color: string };
export type OrbitOptions = {
  nodes: OrbitNode[];
  motion: boolean;
  /** Font family for labels (the page's monospace font). */
  font: string;
  onHover?: (id: string | null) => void;
  onSelect?: (id: string) => void;
  /** Called about once a second with the seconds since start (the HUD clock). */
  onTick?: (seconds: number) => void;
};
export type Orbit = { setMotion: (on: boolean) => void; stop: () => void };

type Vec = [number, number, number];

// Ring radius, tilt, roll, speed and phase for each of up to four subjects (as in the prototype).
const RINGS = [
  { r: 0.62, tilt: 0.35, roll: 0, speed: 0.42 },
  { r: 0.78, tilt: -0.55, roll: 0.6, speed: 0.3 },
  { r: 0.92, tilt: 0.75, roll: -0.4, speed: 0.22 },
  { r: 0.7, tilt: -0.2, roll: 1.2, speed: 0.36 },
];

/** The 12 vertices and 30 edges of an icosahedron (edge length 2). */
export function icosahedron(): { v: Vec[]; e: [number, number][] } {
  const p = (1 + Math.sqrt(5)) / 2;
  const v: Vec[] = [
    [-1, p, 0],
    [1, p, 0],
    [-1, -p, 0],
    [1, -p, 0],
    [0, -1, p],
    [0, 1, p],
    [0, -1, -p],
    [0, 1, -p],
    [p, 0, -1],
    [p, 0, 1],
    [-p, 0, -1],
    [-p, 0, 1],
  ];
  const e: [number, number][] = [];
  for (let i = 0; i < 12; i++)
    for (let j = i + 1; j < 12; j++) {
      const d = Math.hypot(v[i]![0] - v[j]![0], v[i]![1] - v[j]![1], v[i]![2] - v[j]![2]);
      if (Math.abs(d - 2) < 0.01) e.push([i, j]);
    }
  return { v, e };
}

export function rotate([x0, y0, z0]: Vec, ax: number, ay: number, az: number): Vec {
  let [x, y, z] = [x0, y0, z0];
  let c = Math.cos(ax),
    s = Math.sin(ax);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(ay);
  s = Math.sin(ay);
  [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(az);
  s = Math.sin(az);
  [x, y] = [x * c - y * s, x * s + y * c];
  return [x, y, z];
}

/** Perspective projection into a w×h box: [x, y, scale]. */
export function project([x, y, z]: Vec, w: number, h: number): Vec {
  const radius = Math.min(w, h) * 0.46;
  const f = 2.6 / (2.6 + z);
  return [w / 2 + x * radius * f, h / 2 + y * radius * f, f];
}

export type Placed = { id: string; x: number; y: number; f: number };

/** Where each subject is at time t (seconds), with the pointer's parallax gx, gy. */
export function place(nodes: OrbitNode[], t: number, w: number, h: number, gx = 0.25, gy = 0): Placed[] {
  return nodes.slice(0, RINGS.length).map((n, i) => {
    const ring = RINGS[i]!;
    const a = t * ring.speed + i * 1.6;
    const [x, y, f] = project(
      rotate([Math.cos(a) * ring.r, 0, Math.sin(a) * ring.r], ring.tilt + gx, gy, ring.roll),
      w,
      h,
    );
    return { id: n.id, x, y, f };
  });
}

/** The subject under the pointer: the nearest one within its hexagon. */
export function hit(placed: Placed[], px: number, py: number): string | null {
  let best: Placed | null = null;
  for (const p of placed) {
    if (Math.hypot(p.x - px, p.y - py) < 30 * p.f && (!best || p.f > best.f)) best = p;
  }
  return best?.id ?? null;
}

const STARS = Array.from({ length: 90 }, (_, i) => {
  // Deterministic "random": the same sky every time (and in tests).
  const r = (k: number) => Math.abs(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
  return { x: r(1) * 2 - 1, y: r(2) * 2 - 1, z: r(3), tw: r(4) * 6 };
});

export function startOrbit(canvas: HTMLCanvasElement, opts: OrbitOptions): Orbit {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { setMotion: () => {}, stop: () => {} };
  const ico = icosahedron();
  let motion = opts.motion;
  let w = 0,
    h = 0,
    t = 0,
    mx = 0,
    my = 0;
  let hover: string | null = null;
  let placed: Placed[] = [];
  let frame = 0;
  let last = 0;
  let started = 0;
  let lastTick = -1;
  let visible = true;
  let stopped = false;

  function size() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = r.width;
    h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw() {
    if (!w) size();
    const c = ctx!;
    const gx = my * 0.5 + 0.25,
      gy = mx * 0.7;
    c.clearRect(0, 0, w, h);
    for (const s of STARS) {
      const a = 0.25 + 0.35 * Math.sin(t * 1.5 + s.tw);
      c.fillStyle = `rgba(143,195,200,${(a * s.z).toFixed(3)})`;
      c.fillRect(w / 2 + s.x * w * 0.5 + mx * 20 * s.z, h / 2 + s.y * h * 0.5 + my * 20 * s.z, 1.4, 1.4);
    }
    const glow = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.2);
    glow.addColorStop(0, 'rgba(24,228,236,.25)');
    glow.addColorStop(1, 'rgba(24,228,236,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, w, h);

    const iv = ico.v.map((v) =>
      project(rotate([v[0] * 0.12, v[1] * 0.12, v[2] * 0.12], t * 0.4 + gx, t * 0.6 + gy, 0), w, h),
    );
    c.strokeStyle = 'rgba(24,228,236,.75)';
    c.lineWidth = 1;
    c.beginPath();
    for (const [a, b] of ico.e) {
      c.moveTo(iv[a]![0], iv[a]![1]);
      c.lineTo(iv[b]![0], iv[b]![1]);
    }
    c.stroke();
    c.fillStyle = '#d9fbfc';
    for (const p of iv) c.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3);

    // Rings, drawn back to front by depth.
    opts.nodes.slice(0, RINGS.length).forEach((n, i) => {
      const ring = RINGS[i]!;
      const on = hover === n.id;
      c.strokeStyle = n.color;
      c.lineWidth = on ? 1.6 : 1;
      let prev: Vec | null = null;
      for (let k = 0; k <= 96; k++) {
        const a = (k / 96) * Math.PI * 2;
        const p = project(rotate([Math.cos(a) * ring.r, 0, Math.sin(a) * ring.r], ring.tilt + gx, gy, ring.roll), w, h);
        if (prev) {
          c.globalAlpha = Math.max(0, (on ? 0.55 : 0.18) * (prev[2] * 1.2 - 0.4));
          c.beginPath();
          c.moveTo(prev[0], prev[1]);
          c.lineTo(p[0], p[1]);
          c.stroke();
        }
        prev = p;
      }
      c.globalAlpha = 1;
    });

    placed = place(opts.nodes, t, w, h, gx, gy);
    const byDepth = [...placed].sort((a, b) => a.f - b.f);
    for (const p of byDepth) {
      const n = opts.nodes.find((x) => x.id === p.id)!;
      const on = hover === n.id;
      const size = (on ? 30 : 24) * p.f;
      c.strokeStyle = n.color;
      c.globalAlpha = 0.25;
      c.setLineDash([3, 4]);
      c.beginPath();
      c.moveTo(w / 2, h / 2);
      c.lineTo(p.x, p.y);
      c.stroke();
      c.setLineDash([]);
      c.globalAlpha = 1;
      c.save();
      c.translate(p.x, p.y);
      c.shadowColor = n.color;
      c.shadowBlur = on ? 28 : 14;
      c.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k + Math.PI / 6;
        c.lineTo(Math.cos(a) * size, Math.sin(a) * size);
      }
      c.closePath();
      c.fillStyle = 'rgba(3,8,12,.92)';
      c.fill();
      c.lineWidth = on ? 2 : 1.4;
      c.stroke();
      c.shadowBlur = 0;
      c.fillStyle = n.color;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `500 ${Math.round(15 * p.f * (n.glyph.length > 1 ? 0.85 : 1.15))}px ${opts.font}`;
      c.fillText(n.glyph, 0, 1);
      c.font = `600 ${Math.round(11 * p.f)}px ${opts.font}`;
      c.fillStyle = on ? '#d9fbfc' : 'rgba(143,195,200,.9)';
      c.fillText(n.name.toUpperCase(), 0, size + 14 * p.f);
      c.restore();
    }
  }

  const running = () => motion && visible && !document.hidden && !stopped;

  function loop(now: number) {
    frame = 0;
    if (!running()) return;
    if (!started) started = now;
    t += Math.min(0.05, last ? (now - last) / 1000 : 0);
    last = now;
    const secs = Math.floor((now - started) / 1000);
    if (secs !== lastTick) {
      lastTick = secs;
      opts.onTick?.(secs);
    }
    draw();
    frame = requestAnimationFrame(loop);
  }

  function resume() {
    if (running() && !frame) {
      last = 0;
      frame = requestAnimationFrame(loop);
    }
  }
  function pause() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }
  /** With the loop paused, redraw once (hover, resize, motion off). */
  const redraw = () => {
    if (!frame && !stopped) draw();
  };

  function onMove(e: PointerEvent) {
    const r = canvas.getBoundingClientRect();
    mx = (e.clientX - r.left) / r.width - 0.5;
    my = (e.clientY - r.top) / r.height - 0.5;
    const id = hit(placed, e.clientX - r.left, e.clientY - r.top);
    if (id !== hover) {
      hover = id;
      canvas.style.cursor = id ? 'pointer' : 'crosshair';
      opts.onHover?.(id);
    }
    redraw();
  }
  function onLeave() {
    mx = my = 0;
    if (hover) opts.onHover?.(null);
    hover = null;
    redraw();
  }
  function onClick() {
    if (hover) opts.onSelect?.(hover);
  }
  const onResize = () => {
    size();
    redraw();
  };
  const onVisibility = () => (document.hidden ? pause() : resume());

  const io =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(([entry]) => {
          visible = !!entry?.isIntersecting;
          if (visible) resume();
          else pause();
        });
  io?.observe(canvas);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('click', onClick);
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);

  size();
  draw();
  resume();

  return {
    setMotion(on) {
      motion = on;
      if (on) resume();
      else {
        pause();
        redraw();
      }
    },
    stop() {
      stopped = true;
      pause();
      io?.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('click', onClick);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
