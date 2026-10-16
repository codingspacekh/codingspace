/**
 * The visitor's display choices (03 PUB-11), remembered in this browser:
 *   motion  — follows the OS "reduce motion" setting until the visitor picks
 *   sound   — off until the visitor turns it on
 *   reading — reading mode: no backdrop, glow or motion, for long lessons
 *   invited — the one-time "this site has sound" offer was answered
 * Read through useSyncExternalStore: the server renders the defaults, and the browser
 * switches to the stored choice right after hydration, without a mismatch warning.
 * Nothing here is sent anywhere (NFR-PRIV-1: no tracking, and no cookies).
 */

export type Prefs = { motion: boolean; sound: boolean; reading: boolean; invited: boolean };
type Stored = Partial<Prefs>;

const KEY = 'cs-prefs';
const REDUCE = '(prefers-reduced-motion: reduce)';
export const SERVER_PREFS: Prefs = Object.freeze({ motion: true, sound: false, reading: false, invited: false });

function load(): Stored {
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    if (!v || typeof v !== 'object') return {};
    const out: Stored = {};
    for (const k of ['motion', 'sound', 'reading', 'invited'] as const) {
      const x = (v as Record<string, unknown>)[k];
      if (typeof x === 'boolean') out[k] = x;
    }
    return out;
  } catch {
    // Private mode, blocked storage, bad JSON: fall back to the defaults.
    return {};
  }
}

const osAllowsMotion = () => !window.matchMedia?.(REDUCE).matches;

const listeners = new Set<() => void>();
let cached: Prefs | null = null;
/** Choices made on this page that couldn't be stored (storage blocked) still apply here. */
const memory: Stored = {};

function compute(): Prefs {
  const s = { ...load(), ...memory };
  return {
    motion: s.motion ?? osAllowsMotion(),
    sound: s.sound ?? false,
    reading: s.reading ?? false,
    invited: s.invited ?? false,
  };
}

const changed = () => {
  cached = null;
  listeners.forEach((l) => l());
};

export function getPrefs(): Prefs {
  const next = compute();
  // Same values → same object, as useSyncExternalStore requires.
  if (!cached || (Object.keys(next) as (keyof Prefs)[]).some((k) => cached![k] !== next[k])) {
    cached = next;
  }
  return cached;
}

export const getServerPrefs = () => SERVER_PREFS;

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changed a choice, or the OS setting changed.
  const media = window.matchMedia?.(REDUCE);
  window.addEventListener('storage', changed);
  media?.addEventListener?.('change', changed);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', changed);
    media?.removeEventListener?.('change', changed);
  };
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...load(), [key]: value }));
    delete memory[key];
  } catch {
    // Not stored: the choice still applies until the visitor leaves the page.
    memory[key] = value;
  }
  changed();
}
