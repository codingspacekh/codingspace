import { useSyncExternalStore } from 'react';

/**
 * Lessons the visitor marked as done (v1.1), kept in this browser only like saved lessons
 * (./saved-store.ts): no sign-in, nothing sent anywhere (NFR-PRIV-1). Series, subject and
 * lesson pages show progress from it. The server renders "nothing done"; the browser switches
 * to the stored list right after hydration.
 */

/** Lesson slug → ISO time it was marked done. */
export type DoneLessons = Readonly<Record<string, string>>;

const KEY = 'cs-done';
/** Far more lessons than the site will have; keeps the stored list bounded. */
export const MAX_DONE = 2000;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EMPTY: DoneLessons = Object.freeze({});

function load(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    const items = v && typeof v === 'object' ? (v as { items?: unknown }).items : null;
    if (!items || typeof items !== 'object' || Array.isArray(items)) return {};
    const ok = Object.entries(items).filter(([slug, at]) => SLUG.test(slug) && typeof at === 'string');
    return Object.fromEntries(ok.slice(-MAX_DONE));
  } catch {
    // Private mode, blocked storage, bad JSON: nothing done.
    return {};
  }
}

const listeners = new Set<() => void>();
let cached: DoneLessons | null = null;
let cachedRaw: string | null = null;
/** The list on this page when storage is blocked: marking still works until the page is left. */
let memory: Record<string, string> | null = null;

export function getDone(): DoneLessons {
  const next = memory ?? load();
  const raw = JSON.stringify(next);
  // Same contents → same object, as useSyncExternalStore requires.
  if (!cached || raw !== cachedRaw) {
    cached = Object.keys(next).length ? Object.freeze(next) : EMPTY;
    cachedRaw = raw;
  }
  return cached;
}

const getServerDone = () => EMPTY;
const changed = () => listeners.forEach((l) => l());

export function subscribeDone(listener: () => void): () => void {
  listeners.add(listener);
  // Marked in another tab.
  window.addEventListener('storage', changed);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', changed);
  };
}

function store(items: Record<string, string>) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ v: 1, items }));
    memory = null;
  } catch {
    memory = items;
  }
  changed();
}

export function markDone(slug: string, now = new Date()) {
  const rest = Object.entries(getDone()).filter(([s]) => s !== slug);
  // Newest last, so the oldest are dropped first past the limit.
  store(Object.fromEntries([...rest, [slug, now.toISOString()]].slice(-MAX_DONE)));
  // Like saving: ask the browser to keep the site's storage (best effort).
  void navigator.storage?.persist?.().catch(() => {});
}

export function unmarkDone(slug: string) {
  store(Object.fromEntries(Object.entries(getDone()).filter(([s]) => s !== slug)));
}

export function useDone(): DoneLessons {
  return useSyncExternalStore(subscribeDone, getDone, getServerDone);
}

/** How many of these lessons are done, and the first one that isn't (where to continue). */
export function progressOf(slugs: readonly string[], done: DoneLessons) {
  const count = slugs.filter((s) => done[s]).length;
  const nextIndex = slugs.findIndex((s) => !done[s]);
  return { done: count, total: slugs.length, next: nextIndex === -1 ? null : nextIndex };
}
