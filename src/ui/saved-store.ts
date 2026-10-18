import { useSyncExternalStore } from 'react';
import { SLUG } from '@/lib/slug';

/**
 * Lessons and posts the visitor saved for later, kept in this browser only (no sign-in, nothing
 * sent anywhere: NFR-PRIV-1). Another device or a cleared browser starts empty; Safari on iPhone
 * may clear it after 7 days without a visit, so the first save asks the browser to keep it.
 * Read through useSyncExternalStore like the display choices (./prefs-store.ts): the server
 * renders "nothing saved", and the browser switches to the stored list right after hydration.
 */

export type SavedPost = {
  slug: string;
  title: string;
  /** The subject id, or null for a life post. */
  subject: string | null;
  lang: 'en' | 'km';
  /** ISO time it was saved. */
  savedAt: string;
};

const KEY = 'cs-saved';
/** Plenty for a student; keeps the stored list small. */
export const MAX_SAVED = 200;
const EMPTY: readonly SavedPost[] = Object.freeze([]);

function valid(v: unknown): v is SavedPost {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.slug === 'string' &&
    SLUG.test(p.slug) &&
    typeof p.title === 'string' &&
    p.title.length <= 300 &&
    (p.subject === null || (typeof p.subject === 'string' && /^[a-z]+$/.test(p.subject))) &&
    (p.lang === 'en' || p.lang === 'km') &&
    typeof p.savedAt === 'string'
  );
}

function load(): SavedPost[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    const list = v && typeof v === 'object' ? (v as { items?: unknown }).items : null;
    return Array.isArray(list) ? list.filter(valid).slice(0, MAX_SAVED) : [];
  } catch {
    // Private mode, blocked storage, bad JSON: nothing saved.
    return [];
  }
}

const listeners = new Set<() => void>();
let cached: readonly SavedPost[] | null = null;
let cachedRaw: string | null = null;
/** The list on this page when storage is blocked: saving still works until the page is left. */
let memory: SavedPost[] | null = null;

export function getSaved(): readonly SavedPost[] {
  const next = memory ?? load();
  const raw = JSON.stringify(next);
  // Same contents → same array, as useSyncExternalStore requires.
  if (!cached || raw !== cachedRaw) {
    cached = next.length ? next : EMPTY;
    cachedRaw = raw;
  }
  return cached;
}

const getServerSaved = () => EMPTY;

const changed = () => listeners.forEach((l) => l());

export function subscribeSaved(listener: () => void): () => void {
  listeners.add(listener);
  // Saved or removed in another tab.
  window.addEventListener('storage', changed);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', changed);
  };
}

function store(items: SavedPost[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ v: 1, items }));
    memory = null;
  } catch {
    memory = items;
  }
  changed();
}

/** Newest first. Saving again moves it to the top with its current title. */
export function savePost(post: Omit<SavedPost, 'savedAt'>, now = new Date()) {
  const rest = getSaved().filter((p) => p.slug !== post.slug);
  store([{ ...post, savedAt: now.toISOString() }, ...rest].slice(0, MAX_SAVED));
  // Asks the browser not to clear the site's storage when space runs low (Chrome, Firefox);
  // Safari decides for itself. Best effort: nothing depends on the answer.
  void navigator.storage?.persist?.().catch(() => {});
}

export function unsavePost(slug: string) {
  store(getSaved().filter((p) => p.slug !== slug));
}

export function useSaved(): readonly SavedPost[] {
  return useSyncExternalStore(subscribeSaved, getSaved, getServerSaved);
}
