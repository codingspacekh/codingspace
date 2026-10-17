// Origins that published content may load from (03 §8.4). Shared by the renderer's URL
// policy and the CSP so the two cannot drift apart. Plain ESM so next.config.mjs can import it.

const DEFAULT_MEDIA_BASE_URL = 'https://files.codingspacekh.dev';

/**
 * Where uploaded images and files are served from: R2's public bucket address until the
 * domain is ready (https://pub-….r2.dev), then https://files.codingspacekh.dev. Set at build
 * time (NEXT_PUBLIC_, so the editor sees the same value). Plain http only for this machine (tests).
 * @param {string | undefined} value
 * @returns {string}
 */
export function mediaBaseUrl(value) {
  const raw = (value ?? '').trim().replace(/\/+$/, '');
  if (!raw) return DEFAULT_MEDIA_BASE_URL;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`NEXT_PUBLIC_MEDIA_BASE_URL must be a URL, got "${value}"`);
  }
  const local = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if ((url.protocol !== 'https:' && !local) || url.username || url.password || url.search || url.hash) {
    throw new Error(`NEXT_PUBLIC_MEDIA_BASE_URL must be a plain https URL, got "${value}"`);
  }
  return url.origin + url.pathname.replace(/\/+$/, '');
}

/** Images and file downloads: `${MEDIA_BASE_URL}/<key>`. */
export const MEDIA_BASE_URL = mediaBaseUrl(process.env.NEXT_PUBLIC_MEDIA_BASE_URL);
export const MEDIA_ORIGIN = new URL(MEDIA_BASE_URL).origin;

/**
 * R2's S3 endpoint, where the admin's browser uploads to (presigned PUT): CSP connect-src.
 * @param {string | undefined} accountId
 * @returns {string | null}
 */
export function r2Endpoint(accountId) {
  if (!accountId) return null;
  if (!/^[a-f0-9]{32}$/.test(accountId)) throw new Error('R2_ACCOUNT_ID must be the 32-character account id');
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

/** Embed providers; the renderer builds iframe URLs on these origins only. */
export const EMBED_ORIGINS = Object.freeze({
  youtube: 'https://www.youtube-nocookie.com',
  desmos: 'https://www.desmos.com',
  geogebra: 'https://www.geogebra.org',
});
