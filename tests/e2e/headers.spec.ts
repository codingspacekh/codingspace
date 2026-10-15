import { test, expect } from '@playwright/test';

// NFR-SEC-2: every HTML response, including errors, carries the security headers.
for (const path of ['/', '/this-page-does-not-exist']) {
  test(`${path} sends security headers`, async ({ request }) => {
    const res = await request.get(path);
    const h = res.headers();
    expect(h['content-security-policy']).toContain("script-src 'self'");
    expect(h['content-security-policy']).not.toContain("'unsafe-eval'");
    expect(h['strict-transport-security']).toContain('max-age=63072000');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['permissions-policy']).toContain('camera=()');
    expect(h['x-powered-by']).toBeUndefined();
    expect(h['x-robots-tag']).toBe('noindex, nofollow'); // until launch (M7)
  });
}
