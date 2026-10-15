// Security headers for every response (03 §8.3). Plain ESM so next.config.mjs can import it.
// The CSP shape was proven in the M0 spike (docs/adr/0001-arwes.md).

const HTTPS_ORIGIN = /^https:\/\/[a-z0-9.-]+(:\d+)?$/i;

/** @param {string | undefined} value @param {string} name */
function origin(value, name) {
  if (!value) return null;
  const trimmed = value.replace(/\/+$/, '');
  if (!HTTPS_ORIGIN.test(trimmed)) throw new Error(`${name} must be a plain https origin, got "${value}"`);
  return trimmed;
}

/**
 * @param {{ supabaseUrl?: string, filesOrigin?: string }} options
 * @returns {string}
 */
export function buildCsp({ supabaseUrl, filesOrigin } = {}) {
  const supabase = origin(supabaseUrl, 'supabaseUrl');
  const files = origin(filesOrigin, 'filesOrigin');
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    // KaTeX, Shiki and Arwes set style="" attributes. Attributes can't run code; <style> elements stay 'self'.
    "style-src-attr 'unsafe-inline'",
    ['img-src', "'self'", 'data:', files].filter(Boolean).join(' '),
    "font-src 'self'",
    ['connect-src', "'self'", supabase].filter(Boolean).join(' '),
    ['media-src', "'self'", files].filter(Boolean).join(' '),
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

/**
 * @param {{ supabaseUrl?: string, filesOrigin?: string }} options
 * @returns {{ key: string, value: string }[]}
 */
export function securityHeaders(options = {}) {
  return [
    { key: 'Content-Security-Policy', value: buildCsp(options) },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ];
}
