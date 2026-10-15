// M0 spike: start from the strictest CSP and relax only when a test proves it necessary.
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  // KaTeX, Shiki and Arwes set style="" attributes. Attributes can't run code; <style> elements stay 'self'.
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Arwes does not support React StrictMode.
  reactStrictMode: false,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
