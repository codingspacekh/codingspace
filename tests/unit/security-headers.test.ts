import { mediaBaseUrl, r2Endpoint } from '@/config/content-origins.mjs';
import { BOOT_SCRIPT_HASH, buildCsp, securityHeaders } from '@/config/security-headers.mjs';
import { renderContent } from '@/server/render';

const directives = (csp: string) => csp.split(';').map((d) => d.trim());

describe('Content-Security-Policy (03 §8.3, ADR 0001)', () => {
  const csp = buildCsp({});

  it('keeps scripts strict: self and one hashed boot script, no unsafe-inline, no eval', () => {
    expect(directives(csp)).toContain(`script-src 'self' ${BOOT_SCRIPT_HASH}`);
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
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

  it('allows the Supabase API only when configured', () => {
    expect(csp).not.toContain('supabase.co');
    const withSupabase = buildCsp({ supabaseUrl: 'https://abc.supabase.co' });
    expect(directives(withSupabase)).toContain("connect-src 'self' https://abc.supabase.co");
  });

  it('loads images and media only from the site and the media origin', () => {
    expect(directives(csp)).toContain("img-src 'self' data: https://files.codingspacekh.dev");
    expect(directives(csp)).toContain("media-src 'self' https://files.codingspacekh.dev");
  });

  it('allows frames only from the three embed providers', () => {
    expect(directives(csp)).toContain(
      'frame-src https://www.youtube-nocookie.com https://www.desmos.com https://www.geogebra.org',
    );
  });

  it('allows the R2 upload endpoint only when configured', () => {
    expect(csp).not.toContain('r2.cloudflarestorage.com');
    const withR2 = buildCsp({ uploadOrigin: r2Endpoint('0123456789abcdef0123456789abcdef') });
    expect(directives(withR2)).toContain(
      "connect-src 'self' https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
    );
    expect(() => r2Endpoint('evil.example/')).toThrow();
  });

  it('rejects a Supabase URL that is not a plain https origin', () => {
    expect(() => buildCsp({ supabaseUrl: 'http://abc.supabase.co' })).toThrow();
    expect(() => buildCsp({ supabaseUrl: "https://x.io; script-src 'unsafe-inline'" })).toThrow();
  });
});

// The renderer and the CSP share src/config/content-origins.mjs. This checks the result,
// not the wiring: everything rendered content can load must be allowed, or pages break.
describe('CSP allows what the renderer outputs', () => {
  const csp = buildCsp({});

  it('covers every embed provider and the media origin', async () => {
    const { html } = await renderContent({
      type: 'doc',
      content: [
        { type: 'embed', attrs: { provider: 'youtube', id: 'dQw4w9WgXcQ' } },
        { type: 'embed', attrs: { provider: 'desmos', id: 'abcde12345' } },
        { type: 'embed', attrs: { provider: 'geogebra', id: 'Xyz123ab' } },
        { type: 'image', attrs: { src: 'https://files.codingspacekh.dev/a.png', alt: 'a' } },
      ],
    });
    const page = new DOMParser().parseFromString(html, 'text/html');
    const allowed = (directive: string) =>
      directives(csp)
        .find((d) => d.startsWith(`${directive} `))!
        .split(' ')
        .slice(1);

    const frames = Array.from(page.querySelectorAll('iframe'), (f) => new URL(f.src).origin);
    const images = Array.from(page.querySelectorAll('img'), (i) => new URL(i.src).origin);
    expect(frames).toHaveLength(3);
    for (const o of frames) expect(allowed('frame-src')).toContain(o);
    for (const o of images) expect(allowed('img-src')).toContain(o);
  });
});

describe('security headers', () => {
  const byKey = Object.fromEntries(securityHeaders({}).map((h) => [h.key, h.value]));

  it('sends HSTS, nosniff, referrer and permissions policies', () => {
    expect(byKey['Strict-Transport-Security']).toBe('max-age=63072000; includeSubDomains; preload');
    expect(byKey['X-Content-Type-Options']).toBe('nosniff');
    expect(byKey['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(byKey['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()');
    expect(byKey['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(byKey['Cross-Origin-Resource-Policy']).toBe('same-origin');
    expect(byKey['Content-Security-Policy']).toBe(buildCsp({}));
  });
});

describe('search indexing (M7: indexed only after launch)', () => {
  const robots = (opts: Parameters<typeof securityHeaders>[0]) =>
    securityHeaders(opts).find((h) => h.key === 'X-Robots-Tag')?.value;

  it('asks search engines not to index the site by default', () => {
    expect(robots({})).toBe('noindex, nofollow');
  });

  it('allows indexing only when explicitly enabled for launch', () => {
    expect(robots({ indexable: true })).toBeUndefined();
  });
});

describe('media base URL (NEXT_PUBLIC_MEDIA_BASE_URL)', () => {
  it('defaults to the files domain', () => {
    expect(mediaBaseUrl(undefined)).toBe('https://files.codingspacekh.dev');
  });

  it("takes R2's temporary public address until the domain is ready", () => {
    expect(mediaBaseUrl('https://pub-0123456789abcdef.r2.dev/')).toBe('https://pub-0123456789abcdef.r2.dev');
  });

  it('allows plain http only on this machine (tests)', () => {
    expect(mediaBaseUrl('http://localhost:3000/api/media-local')).toBe('http://localhost:3000/api/media-local');
    expect(() => mediaBaseUrl('http://pub-x.r2.dev')).toThrow();
  });

  it.each(['javascript:alert(1)', 'https://user:pw@files.example', 'https://files.example/?a=1', 'files.example'])(
    'rejects %s',
    (value) => {
      expect(() => mediaBaseUrl(value)).toThrow();
    },
  );
});
