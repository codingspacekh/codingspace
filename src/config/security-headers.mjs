// Security headers for every response (03 §8.3). Plain ESM so next.config.mjs can import it.
// The CSP shape was proven in the M0 spike (docs/adr/0001-arwes.md).

import { createHash } from 'node:crypto';
import { BOOT_SCRIPT } from './boot-script.mjs';
import { EMBED_ORIGINS, MEDIA_ORIGIN } from './content-origins.mjs';

/** The one inline script (the first-load arrival, ./boot-script.mjs), allowed by its hash only. */
export const BOOT_SCRIPT_HASH = `'sha256-${createHash('sha256').update(BOOT_SCRIPT).digest('base64')}'`;

const HTTPS_ORIGIN = /^https:\/\/[a-z0-9.-]+(:\d+)?$/i;

/** @param {string | undefined} value @param {string} name */
function origin(value, name) {
  if (!value) return null;
  const trimmed = value.replace(/\/+$/, '');
  if (!HTTPS_ORIGIN.test(trimmed)) throw new Error(`${name} must be a plain https origin, got "${value}"`);
  return trimmed;
}

/**
 * @param {{ supabaseUrl?: string, uploadOrigin?: string | null }} options
 *   uploadOrigin: R2's S3 endpoint, which the admin's browser uploads to (r2Endpoint()).
 * @returns {string}
 */
export function buildCsp({ supabaseUrl, uploadOrigin } = {}) {
  const supabase = origin(supabaseUrl, 'supabaseUrl');
  const upload = origin(uploadOrigin ?? undefined, 'uploadOrigin');
  return [
    "default-src 'self'",
    `script-src 'self' ${BOOT_SCRIPT_HASH}`,
    "style-src 'self'",
    // KaTeX, Shiki and Arwes set style="" attributes. Attributes can't run code; <style> elements stay 'self'.
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' data: ${MEDIA_ORIGIN}`,
    "font-src 'self'",
    ['connect-src', "'self'", supabase, upload].filter(Boolean).join(' '),
    `media-src 'self' ${MEDIA_ORIGIN}`,
    // Lesson embeds only; the renderer rebuilds every iframe URL on these origins.
    `frame-src ${Object.values(EMBED_ORIGINS).join(' ')}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

/**
 * @param {{ supabaseUrl?: string, uploadOrigin?: string | null, indexable?: boolean }} options
 * @returns {{ key: string, value: string }[]}
 */
export function securityHeaders(options = {}) {
  const { indexable = false, ...cspOptions } = options;
  return [
    { key: 'Content-Security-Policy', value: buildCsp(cspOptions) },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    // Keep the site out of search results until launch (M7 sets SITE_INDEXABLE=true in production).
    ...(indexable ? [] : [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }]),
  ];
}
