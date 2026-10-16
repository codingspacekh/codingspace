/**
 * URL allow-lists from 03 §8.4. Every URL in rendered content passes through one of
 * these functions; anything they reject is dropped, never passed through.
 */

import { EMBED_ORIGINS as ORIGINS, MEDIA_ORIGIN } from '@/config/content-origins.mjs';

export { MEDIA_ORIGIN };

const EMBEDS = {
  youtube: {
    origin: ORIGINS.youtube,
    id: /^[A-Za-z0-9_-]{11}$/,
    src: (id: string) => `${ORIGINS.youtube}/embed/${id}`,
    title: 'YouTube video',
  },
  desmos: {
    origin: ORIGINS.desmos,
    id: /^[a-z0-9]{10,20}$/,
    src: (id: string) => `${ORIGINS.desmos}/calculator/${id}?embed`,
    title: 'Desmos graph',
  },
  geogebra: {
    origin: ORIGINS.geogebra,
    id: /^[A-Za-z0-9]{6,12}$/,
    src: (id: string) => `${ORIGINS.geogebra}/material/iframe/id/${id}`,
    title: 'GeoGebra applet',
  },
} as const;

export const EMBED_ORIGINS = Object.values(EMBEDS).map((e) => e.origin);

// Whitespace and control characters are how scheme filters get bypassed (java\tscript:).
const hasUnsafeChars = (s: string) =>
  [...s].some((c) => {
    const code = c.codePointAt(0)!;
    return code <= 0x20 || (code >= 0x7f && code <= 0x9f);
  });
const ANCHOR = /^#[\p{L}\p{N}\p{M}_-]+$/u;
const INTERNAL_BASE = 'https://internal.invalid';

function parse(value: string, base?: string): URL | null {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

/** Links: `https:`, `mailto:`, site-relative paths and in-page anchors. */
export function safeLinkHref(href: unknown): string | null {
  if (typeof href !== 'string' || href === '' || hasUnsafeChars(href)) return null;
  if (ANCHOR.test(href)) return href;
  if (href.startsWith('/')) {
    const url = parse(href, INTERNAL_BASE);
    if (!url || url.origin !== INTERNAL_BASE) return null; // catches //host and /\host
    return url.pathname + url.search + url.hash;
  }
  const url = parse(href);
  if (!url || url.username || url.password) return null;
  if (url.protocol === 'https:') return url.href;
  if (url.protocol === 'mailto:') return href;
  return null;
}

/** Images and file downloads: only from our own media origin. */
export function safeMediaUrl(src: unknown): string | null {
  if (typeof src !== 'string' || hasUnsafeChars(src)) return null;
  const url = parse(src);
  if (!url || url.origin !== MEDIA_ORIGIN || url.username || url.password) return null;
  return url.href;
}

export type Embed = { provider: keyof typeof EMBEDS; src: string; defaultTitle: string };

/** Embeds: the URL is rebuilt from a checked id; a stored URL is never used. */
export function safeEmbed(provider: unknown, id: unknown): Embed | null {
  if (typeof provider !== 'string' || typeof id !== 'string' || !Object.hasOwn(EMBEDS, provider)) {
    return null;
  }
  const embed = EMBEDS[provider as keyof typeof EMBEDS];
  if (!embed.id.test(id)) return null;
  return { provider: provider as keyof typeof EMBEDS, src: embed.src(id), defaultTitle: embed.title };
}
