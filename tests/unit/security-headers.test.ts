import { buildCsp, securityHeaders } from '@/config/security-headers.mjs';

const directives = (csp: string) => csp.split(';').map((d) => d.trim());

describe('Content-Security-Policy (03 §8.3, ADR 0001)', () => {
  const csp = buildCsp({});

  it('keeps scripts strict: self only, no inline, no eval', () => {
    expect(directives(csp)).toContain("script-src 'self'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("allows 'unsafe-inline' only for style attributes", () => {
    const relaxed = directives(csp).filter((d) => d.includes("'unsafe-inline'"));
    expect(relaxed).toEqual(["style-src-attr 'unsafe-inline'"]);
    expect(directives(csp)).toContain("style-src 'self'");
  });

  it('locks down framing, plugins, base URI and form targets', () => {
    for (const d of [
      "default-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ]) {
      expect(directives(csp)).toContain(d);
    }
  });

  it('allows the Supabase API and the files domain only when configured', () => {
    expect(csp).not.toContain('supabase.co');
    const withExtras = buildCsp({
      supabaseUrl: 'https://abc.supabase.co',
      filesOrigin: 'https://files.codingspace.io',
    });
    expect(directives(withExtras)).toContain("connect-src 'self' https://abc.supabase.co");
    expect(directives(withExtras)).toContain("img-src 'self' data: https://files.codingspace.io");
  });

  it('rejects origins that are not plain https origins', () => {
    expect(() => buildCsp({ supabaseUrl: 'http://abc.supabase.co' })).toThrow();
    expect(() => buildCsp({ filesOrigin: "https://x.io; script-src 'unsafe-inline'" })).toThrow();
  });
});

describe('security headers', () => {
  const byKey = Object.fromEntries(securityHeaders({}).map((h) => [h.key, h.value]));

  it('sends HSTS, nosniff, referrer and permissions policies', () => {
    expect(byKey['Strict-Transport-Security']).toBe('max-age=63072000; includeSubDomains; preload');
    expect(byKey['X-Content-Type-Options']).toBe('nosniff');
    expect(byKey['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(byKey['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()');
    expect(byKey['Content-Security-Policy']).toBe(buildCsp({}));
  });
});
