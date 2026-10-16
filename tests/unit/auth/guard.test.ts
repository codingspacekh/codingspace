import type { NextApiRequest, NextApiResponse } from 'next';
import {
  checkOwner,
  isSameOrigin,
  OWNER_GUARD,
  withAuthRoute,
  withOwner,
  type OwnerHandler,
} from '@/server/auth/guard';
import { fakeSupabase, OWNER_CLAIMS } from './fake-supabase';

const fake = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/server/auth/clients', () => ({ apiClient: () => fake.current }));

describe('checkOwner', () => {
  it('401 without a session', async () => {
    const { client, rpc } = fakeSupabase();
    expect(await checkOwner(client)).toEqual({ ok: false, status: 401, error: 'unauthenticated' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('403 with a password-only (AAL1) session, without asking the database', async () => {
    const { client, rpc } = fakeSupabase({ claims: { ...OWNER_CLAIMS, aal: 'aal1' } });
    expect(await checkOwner(client)).toEqual({ ok: false, status: 403, error: 'mfa_required' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('403 when the database says this is not the owner', async () => {
    const { client } = fakeSupabase({ claims: OWNER_CLAIMS, touch: 'forbidden' });
    expect(await checkOwner(client)).toEqual({ ok: false, status: 403, error: 'forbidden' });
  });

  it('401 when the session was revoked (sign out everywhere)', async () => {
    const { client } = fakeSupabase({ claims: OWNER_CLAIMS, touch: 'revoked' });
    expect(await checkOwner(client)).toEqual({ ok: false, status: 401, error: 'revoked' });
  });

  it('401 when PostgREST rejects the token', async () => {
    const { client } = fakeSupabase({ claims: OWNER_CLAIMS, touchError: { code: 'PGRST301', message: 'JWT' } });
    expect(await checkOwner(client)).toEqual({ ok: false, status: 401, error: 'revoked' });
  });

  it('fails loudly on any other database error', async () => {
    const { client } = fakeSupabase({ claims: OWNER_CLAIMS, touchError: { code: '57014', message: 'timeout' } });
    await expect(checkOwner(client)).rejects.toThrow('admin_touch: timeout');
  });

  it('401 after 12 h idle, and signs the session out for good', async () => {
    const { client, auth } = fakeSupabase({ claims: OWNER_CLAIMS, touch: 'expired' });
    expect(await checkOwner(client)).toEqual({ ok: false, status: 401, error: 'expired' });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('passes the owner with 2FA', async () => {
    const { client } = fakeSupabase({ claims: OWNER_CLAIMS });
    expect(await checkOwner(client)).toEqual({ ok: true, userId: 'owner-id', email: 'owner@example.test' });
  });
});

describe('isSameOrigin (CSRF)', () => {
  const host = { host: 'codingspace.io' };
  it('lets safe methods through', () => {
    expect(isSameOrigin('GET', {})).toBe(true);
    expect(isSameOrigin(undefined, {})).toBe(true);
  });
  it('accepts a POST from this site', () => {
    expect(isSameOrigin('POST', { ...host, origin: 'https://codingspace.io' })).toBe(true);
    expect(isSameOrigin('post', { 'x-forwarded-host': 'codingspace.io', origin: 'https://codingspace.io' })).toBe(true);
  });
  it('refuses another site, a missing Origin and garbage', () => {
    expect(isSameOrigin('POST', { ...host, origin: 'https://evil.example' })).toBe(false);
    expect(isSameOrigin('DELETE', { ...host, origin: 'https://codingspace.io.evil.example' })).toBe(false);
    expect(isSameOrigin('POST', host)).toBe(false);
    expect(isSameOrigin('POST', { origin: 'https://codingspace.io' })).toBe(false);
    expect(isSameOrigin('PATCH', { ...host, origin: 'null' })).toBe(false);
  });
});

function call(
  handler: (req: NextApiRequest, res: NextApiResponse) => unknown,
  method: string,
  headers: Record<string, string> = {},
) {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, unknown>,
    body: undefined as unknown,
    setHeader(k: string, v: unknown) {
      this.headers[k.toLowerCase()] = v;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  const req = { method, headers: { host: 'codingspace.io', ...headers }, cookies: {} };
  return Promise.resolve(handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse)).then(() => res);
}

describe('withAuthRoute', () => {
  const inner = vi.fn<Parameters<typeof withAuthRoute>[1]>((_req, res) => res.status(200).json({ done: true }));
  const route = withAuthRoute(['POST'], inner);

  it('allows only its methods, then only this site', async () => {
    fake.current = fakeSupabase().client;
    const wrongMethod = await call(route, 'GET');
    expect(wrongMethod.statusCode).toBe(405);
    expect(wrongMethod.headers.allow).toBe('POST');
    expect((await call(route, 'POST', { origin: 'https://evil.example' })).statusCode).toBe(403);
    expect(inner).not.toHaveBeenCalled();
  });

  it('runs the handler with the request-bound client, never cached', async () => {
    fake.current = fakeSupabase().client;
    const res = await call(route, 'POST', { origin: 'https://codingspace.io' });
    expect(res.body).toEqual({ done: true });
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(inner.mock.calls[0]![2]).toBe(fake.current);
  });
});

describe('withOwner', () => {
  const inner = vi.fn<OwnerHandler>((_req, res) => res.status(200).json({ done: true }));
  const route = withOwner(['POST'], inner);
  beforeEach(() => {
    inner.mockClear();
  });

  it('is marked as guarded', () => {
    expect(route[OWNER_GUARD]).toBe(true);
  });

  it('refuses a cross-site POST before anything else', async () => {
    fake.current = fakeSupabase({ claims: OWNER_CLAIMS }).client;
    const res = await call(route, 'POST', { origin: 'https://evil.example' });
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'bad_origin' });
    expect(inner).not.toHaveBeenCalled();
  });

  it('checks the session before the method, so every method gets 401 without one', async () => {
    fake.current = fakeSupabase().client;
    const res = await call(route, 'GET');
    expect(res.statusCode).toBe(401);
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('405 for the owner on a method the route does not take', async () => {
    fake.current = fakeSupabase({ claims: OWNER_CLAIMS }).client;
    const res = await call(route, 'GET');
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe('POST');
  });

  it('runs the handler for the owner, with the client and owner', async () => {
    const { client } = fakeSupabase({ claims: OWNER_CLAIMS });
    fake.current = client;
    const res = await call(route, 'POST', { origin: 'https://codingspace.io' });
    expect(res.body).toEqual({ done: true });
    expect(inner.mock.calls[0]![2]).toEqual({
      supabase: client,
      owner: { userId: 'owner-id', email: 'owner@example.test' },
    });
  });
});
