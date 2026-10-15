import { securityHeaders } from './src/config/security-headers.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Arwes does not support React StrictMode (ADR 0001).
  reactStrictMode: false,
  poweredByHeader: false,
  async headers() {
    const headers = securityHeaders({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith('https://')
        ? process.env.NEXT_PUBLIC_SUPABASE_URL
        : undefined,
      filesOrigin: process.env.NEXT_PUBLIC_FILES_ORIGIN,
      indexable: process.env.SITE_INDEXABLE === 'true',
    });
    return [{ source: '/:path*', headers }];
  },
};

export default nextConfig;
