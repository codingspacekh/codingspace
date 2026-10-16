import type { NextApiRequest, NextApiResponse } from 'next';
import { NextRequest, NextResponse } from 'next/server';
import { apiClient, cookieOptions, proxyClient } from '@/server/auth/clients';

type Options = {
  cookieOptions: Record<string, unknown>;
  cookies: {
    getAll: () => { name: string; value: string }[];
    setAll: (c: { name: string; value: string; options: Record<string, unknown> }[], h: Record<string, string>) => void;
  };
};
const captured = vi.hoisted(() => ({ options: null as unknown }));
vi.mock('@supabase/ssr', async (original) => ({
  ...(await original<typeof import('@supabase/ssr')>()),
  createServerClient: (_url: string, _key: string, options: unknown) => {
    captured.options = options;
    return {};
  },
}));
const opts = () => captured.options as Options;

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe('session cookies', () => {
  it('are HttpOnly, SameSite=Lax, site-wide, 12 h', () => {
    expect(cookieOptions(true)).toEqual({ path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 43200 });
  });
});

describe('apiClient', () => {
  function fakeRes() {
    const headers: Record<string, unknown> = {};
    return {
      headers,
      getHeader: (k: string) => headers[k],
      setHeader: (k: string, v: unknown) => {
        headers[k] = v;
      },
    };
  }

  it('reads the request cookies and appends Set-Cookie headers (Secure behind https)', () => {
    const res = fakeRes();
    res.setHeader('Set-Cookie', 'other=1');
    const req = { headers: { 'x-forwarded-proto': 'https' }, cookies: { 'sb-x-auth-token': 'abc' } };
    apiClient(req as unknown as NextApiRequest, res as unknown as NextApiResponse);

    expect(opts().cookieOptions).toMatchObject({ httpOnly: true, secure: true });
    expect(opts().cookies.getAll()).toEqual([{ name: 'sb-x-auth-token', value: 'abc' }]);
    opts().cookies.setAll([{ name: 'sb-x-auth-token', value: 'new', options: { path: '/', httpOnly: true } }], {
      'Cache-Control': 'private, no-store',
    });
    expect(res.headers['Set-Cookie']).toEqual(['other=1', 'sb-x-auth-token=new; Path=/; HttpOnly']);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });

  it('is not Secure on plain http (local E2E)', () => {
    apiClient({ headers: {}, cookies: {} } as unknown as NextApiRequest, fakeRes() as unknown as NextApiResponse);
    expect(opts().cookieOptions).toMatchObject({ secure: false });
  });

  it('needs the Supabase settings', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect(() => apiClient({} as NextApiRequest, {} as NextApiResponse)).toThrow('must be set');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  });
});

describe('proxyClient', () => {
  it('writes refreshed tokens to the request (for the route) and to a fresh response', () => {
    const request = new NextRequest('https://codingspace.io/admin', { headers: { cookie: 'sb-x-auth-token=old' } });
    let response = NextResponse.next();
    proxyClient(request, () => (response = NextResponse.next()));

    expect(opts().cookieOptions).toMatchObject({ secure: true });
    expect(opts().cookies.getAll()).toEqual([{ name: 'sb-x-auth-token', value: 'old' }]);
    opts().cookies.setAll([{ name: 'sb-x-auth-token', value: 'new', options: { httpOnly: true } }], {
      'Cache-Control': 'private, no-store',
    });
    expect(request.cookies.get('sb-x-auth-token')?.value).toBe('new');
    expect(response.cookies.get('sb-x-auth-token')).toMatchObject({ value: 'new', httpOnly: true });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
