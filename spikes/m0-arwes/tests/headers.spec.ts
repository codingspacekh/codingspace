import { test, expect } from '@playwright/test';

// NFR-SEC-2: security headers on every HTML response.
for (const path of ['/', '/lesson']) {
  test(`${path} sends the security headers`, async ({ request }) => {
    const res = await request.get(path);
    const h = res.headers();
    const csp = h['content-security-policy'] ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("'unsafe-eval'");
    // The only relaxation allowed: style *attributes* (KaTeX, Shiki, Arwes positioning). Never scripts or <style> elements.
    const directives = csp.split(';').map((d) => d.trim());
    const withUnsafeInline = directives.filter((d) => d.includes("'unsafe-inline'"));
    expect(withUnsafeInline).toEqual(["style-src-attr 'unsafe-inline'"]);
    expect(directives).toContain("style-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(h['strict-transport-security']).toContain('max-age=63072000');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['permissions-policy']).toContain('camera=()');
    expect(h['x-powered-by']).toBeUndefined();
  });
}
