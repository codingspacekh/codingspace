// @vitest-environment node
import type { NextApiRequest, NextApiResponse } from 'next';

// Sign-in throttling per visitor (code review 2026-10-18).

const db = vi.hoisted(() => ({ recent: 0, fail: false, calls: [] as [string, Record<string, unknown>][] }));
vi.mock('@/server/admin/cron', () => ({
  serviceClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.calls.push([fn, args]);
      if (db.fail) return { data: null, error: { message: 'down' } };
      return { data: fn === 'auth_record_failure' ? db.recent + 1 : db.recent, error: null };
    },
  }),
}));
const flow = vi.hoisted(() => ({ signIn: vi.fn(), verify: vi.fn() }));
vi.mock('@/server/auth/flow', async (orig) => ({
  ...(await orig<typeof import('@/server/auth/flow')>()),
  signInWithPassword: flow.signIn,
  verifyCode: flow.verify,
}));
vi.mock('@/server/auth/clients', () => ({ apiClient: () => ({}) }));

import signIn from '@/pages/api/auth/sign-in';
import verify from '@/pages/api/auth/mfa/verify';
import { MAX_FAILURES, recordFailure, tooManyFailures } from '@/server/auth/throttle';

const visitor = (ip = '203.0.113.9') => ({ headers: { 'x-forwarded-for': ip }, socket: {} }) as never;

function post(handler: typeof signIn, body: unknown, ip = '203.0.113.9') {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) {
      this.headers[k.toLowerCase()] = v;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
  };
  const req = {
    method: 'POST',
    headers: { host: 'codingspacekh.dev', origin: 'https://codingspacekh.dev', 'x-forwarded-for': ip },
    socket: {},
    cookies: {},
    body,
  };
  return Promise.resolve(handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse)).then(() => res);
}

beforeEach(() => {
  db.recent = 0;
  db.fail = false;
  db.calls = [];
  flow.signIn.mockReset();
  flow.verify.mockReset();
});

describe('counting failures', () => {
  it('pauses a visitor at MAX_FAILURES recent failures, keyed by a hash (no address stored)', async () => {
    db.recent = MAX_FAILURES - 1;
    expect(await tooManyFailures(visitor())).toBe(false);
    db.recent = MAX_FAILURES;
    expect(await tooManyFailures(visitor())).toBe(true);
    const [fn, args] = db.calls[0]!;
    expect(fn).toBe('auth_failures_recent');
    expect(args).toEqual({ p_key: expect.stringMatching(/^[0-9a-f]{64}$/), p_minutes: 15 });
    expect(JSON.stringify(db.calls)).not.toContain('203.0.113.9');
  });

  it('gives two visitors different keys', async () => {
    await recordFailure(visitor('203.0.113.9'));
    await recordFailure(visitor('198.51.100.1'));
    expect(db.calls[0]![1].p_key).not.toBe(db.calls[1]![1].p_key);
  });

  it('lets sign-in go on when the count can’t be read (Supabase’s own limits still apply)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.fail = true;
    expect(await tooManyFailures(visitor())).toBe(false);
    await expect(recordFailure(visitor())).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(2);
  });
});

describe('POST /api/auth/sign-in', () => {
  const body = { email: 'owner@codingspacekh.dev', password: 'x' };

  it('counts a wrong password, not a right one', async () => {
    flow.signIn.mockResolvedValue({ ok: false, status: 401 });
    expect((await post(signIn, body)).body).toEqual({ error: 'invalid_credentials' });
    expect(db.calls.map((c) => c[0])).toEqual(['auth_failures_recent', 'auth_record_failure']);

    db.calls = [];
    flow.signIn.mockResolvedValue({ ok: true, step: 'verify' });
    expect((await post(signIn, body)).body).toEqual({ step: 'verify' });
    expect(db.calls.map((c) => c[0])).toEqual(['auth_failures_recent']);
  });

  it('answers a paused visitor 429 without asking Supabase', async () => {
    db.recent = MAX_FAILURES;
    const res = await post(signIn, body);
    expect(res).toMatchObject({ statusCode: 429, body: { error: 'rate_limited' } });
    expect(res.headers['retry-after']).toBe('900');
    expect(flow.signIn).not.toHaveBeenCalled();
  });

  it('does not count Supabase’s own rate limit as the visitor’s failure', async () => {
    flow.signIn.mockResolvedValue({ ok: false, status: 429 });
    expect((await post(signIn, body)).statusCode).toBe(429);
    expect(db.calls.map((c) => c[0])).toEqual(['auth_failures_recent']);
  });

  it('checks the body first (a malformed request costs no database call)', async () => {
    expect((await post(signIn, { email: 'nope' })).statusCode).toBe(400);
    expect(db.calls).toEqual([]);
  });
});

describe('POST /api/auth/mfa/verify', () => {
  it('counts a wrong code, and pauses like sign-in', async () => {
    flow.verify.mockResolvedValue('invalid_code');
    expect((await post(verify, { code: '123456' })).statusCode).toBe(400);
    expect(db.calls.map((c) => c[0])).toEqual(['auth_failures_recent', 'auth_record_failure']);

    db.calls = [];
    flow.verify.mockResolvedValue('ok');
    expect((await post(verify, { code: '654321' })).body).toEqual({ ok: true });
    expect(db.calls.map((c) => c[0])).toEqual(['auth_failures_recent']);

    db.recent = MAX_FAILURES;
    flow.verify.mockClear();
    expect(await post(verify, { code: '111111' })).toMatchObject({ statusCode: 429, body: { error: 'rate_limited' } });
    expect(flow.verify).not.toHaveBeenCalled();
  });
});
