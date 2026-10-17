import { test, expect } from '@playwright/test';

// NFR-SEC-2: every HTML response, including errors, carries the security headers.
for (const path of ['/', '/this-page-does-not-exist']) {
  test(`${path} sends security headers`, async ({ request }) => {
    const res = await request.get(path);
    const h = res.headers();
    expect(h['content-security-policy']).toContain("script-src 'self'");
    expect(h['content-security-policy']).not.toContain("'unsafe-eval'");
    expect(h['content-security-policy']).toContain('frame-src https://www.youtube-nocookie.com');
    // Plus the media address, which depends on the build (NEXT_PUBLIC_MEDIA_BASE_URL).
    expect(h['content-security-policy']).toContain("img-src 'self' data: ");
    expect(h['strict-transport-security']).toContain('max-age=63072000');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['permissions-policy']).toContain('camera=()');
    expect(h['cross-origin-opener-policy']).toBe('same-origin');
    expect(h['cross-origin-resource-policy']).toBe('same-origin');
    expect(h['x-powered-by']).toBeUndefined();
    expect(h['x-robots-tag']).toBe('noindex, nofollow'); // until launch (M7)
  });
}
