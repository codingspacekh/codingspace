import { r2Endpoint } from './src/config/content-origins.mjs';
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
      // Uploads go straight from the admin's browser to R2 (presigned PUT, 03 §8.4).
      uploadOrigin: r2Endpoint(process.env.R2_ACCOUNT_ID),
      indexable: process.env.SITE_INDEXABLE === 'true',
    });
    return [{ source: '/:path*', headers }];
  },
};

export default nextConfig;
