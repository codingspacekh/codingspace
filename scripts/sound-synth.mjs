// The site's interface sounds, synthesised from scratch (no third-party audio: the site owns
// them). Deterministic: the same code always writes the same files. Style: short sci-fi
// interface bleeps, after the original Arwes sites (soulextract.com), but our own sounds.
// Used by scripts/make-sounds.mjs; pure functions, so tests can check them.

export const RATE = 22050;

/** A seeded pseudo-random generator (mulberry32), for reproducible noise and typing. */
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n = (ms) => Math.round((RATE * ms) / 1000);
const blank = (ms) => new Float32Array(n(ms));

/** Adds `src` into `dst` starting at `atMs`. */
function mix(dst, src, atMs = 0, gain = 1) {
  const o = n(atMs);
  for (let i = 0; i < src.length && o + i < dst.length; i++) dst[o + i] += src[i] * gain;
  return dst;
}

/** Attack–decay envelope: a click-free start, then an exponential fall. */
function envelope(len, attackMs = 2, decay = 6) {
  const a = Math.max(1, n(attackMs));
  return (i) => (i < a ? i / a : Math.exp((-decay * (i - a)) / Math.max(1, len - a)));
}

/** An oscillator gliding from f0 to f1 Hz. wave: sine | square | saw | tri. */
export function osc(ms, f0, f1 = f0, { wave = 'sine', vol = 0.5, attackMs = 2, decay = 6 } = {}) {
  const out = blank(ms);
  const env = envelope(out.length, attackMs, decay);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const f = f0 * Math.pow(f1 / f0, i / out.length); // exponential glide sounds natural
    phase += f / RATE;
    const p = phase % 1;
    const v =
      wave === 'square'
        ? (p < 0.5 ? 1 : -1) * 0.6
        : wave === 'saw'
          ? (2 * p - 1) * 0.7
          : wave === 'tri'
            ? 4 * Math.abs(p - 0.5) - 1
            : Math.sin(2 * Math.PI * p);
    out[i] = v * vol * env(i);
  }
  return out;
}

/** Noise through a one-pole low-pass whose cut-off glides (a "whoosh"). */
export function noise(ms, seed, { from = 4000, to = 400, vol = 0.4, attackMs = 30, decay = 4 } = {}) {
  const out = blank(ms);
  const env = envelope(out.length, attackMs, decay);
  const rnd = random(seed);
  let y = 0;
  for (let i = 0; i < out.length; i++) {
    const fc = from * Math.pow(to / from, i / out.length);
    const k = 1 - Math.exp((-2 * Math.PI * fc) / RATE);
    y += k * (rnd() * 2 - 1 - y);
    out[i] = y * vol * env(i);
  }
  return out;
}

/** A short feedback echo, for a sense of space. */
function echo(src, delayMs = 70, feedback = 0.32, taps = 3) {
  const out = new Float32Array(src.length + n(delayMs) * taps);
  mix(out, src);
  let g = 1;
  for (let k = 1; k <= taps; k++) {
    g *= feedback;
    mix(out, src, delayMs * k, g);
  }
  return out;
}

/** Peak-normalises to `peak` and fades the last few milliseconds (no click at the end). */
function finish(src, peak = 0.8) {
  let max = 0;
  for (const v of src) max = Math.max(max, Math.abs(v));
  const g = max ? peak / max : 0;
  const fade = n(8);
  return src.map((v, i) => v * g * Math.min(1, (src.length - i) / fade));
}

// ── The sound set ───────────────────────────────────────────────────────────

/** Pointer over a link or button: a tiny high tick. */
export const hover = () => finish(osc(28, 3600, 3200, { wave: 'tri', decay: 9 }), 0.35);

/** A click: two quick bright blips. */
export const click = () =>
  finish(
    echo(
      mix(
        mix(blank(90), osc(30, 1800, 2400, { wave: 'square', vol: 0.35, decay: 7 })),
        osc(40, 2600, 3300, { decay: 8 }),
        28,
      ),
      45,
      0.25,
      2,
    ),
    0.6,
  );

/** Text typing in: a run of soft keys at irregular intervals (~0.9 s). */
export function typing() {
  const rnd = random(7);
  const out = blank(900);
  for (let t = 0; t < 840; t += 32 + rnd() * 34) {
    const f = 1900 + rnd() * 1300;
    mix(out, osc(14, f, f * 0.92, { wave: 'square', vol: 0.18 + rnd() * 0.08, decay: 10 }), t);
  }
  return finish(out, 0.45);
}

/** A panel deploys (page content arriving): a rising sweep with a shimmer. */
export const deploy = () =>
  finish(
    echo(
      mix(
        mix(
          osc(320, 260, 1250, { wave: 'saw', vol: 0.3, attackMs: 20, decay: 3 }),
          osc(320, 520, 2500, { vol: 0.25, attackMs: 20, decay: 3 }),
        ),
        noise(220, 3, { from: 6000, to: 2000, vol: 0.12, attackMs: 40 }),
        60,
      ),
      90,
      0.3,
      3,
    ),
    0.6,
  );

/** Leaving a page: a falling filtered whoosh. */
export const transition = () =>
  finish(
    mix(
      noise(380, 11, { from: 5200, to: 300, vol: 0.5, attackMs: 60, decay: 3.5 }),
      osc(300, 900, 180, { vol: 0.18, attackMs: 30, decay: 3 }),
    ),
    0.55,
  );

/** Sound switched on / the site starting up: a three-note rising chime. */
export function start() {
  const out = blank(1100);
  [523.25, 783.99, 1046.5].forEach((f, i) => {
    mix(out, osc(520, f, f, { wave: 'tri', vol: 0.4, attackMs: 6, decay: 4 }), i * 110);
    mix(out, osc(520, f * 2, f * 2, { vol: 0.12, attackMs: 6, decay: 5 }), i * 110);
  });
  return finish(echo(out, 120, 0.3, 3), 0.7);
}

/** The ones the site uses: ARWES has no hover or page-leave sound (the rest are ARWES's, see
 * public/sounds/LICENSE-arwes.txt); click, typing, deploy and start stay here for reference. */
export const SOUNDS = { hover, transition };
export const ALTERNATIVES = { click, typing, deploy, start };

/** 16-bit mono PCM WAV. */
export function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
