// @vitest-environment node
const rpc = vi.fn();
vi.mock('@/server/data/public', () => ({ db: () => ({ rpc }) }));
import type { NextApiRequest, NextApiResponse } from 'next';
import { clientHash, recordVisit } from '@/server/data/analytics';
import handler from '@/pages/api/visit';

const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const ID = '6f1c2a8e-3b7d-4c55-9a10-2d3e4f5a6b7c';

function req({
  body,
  headers = {},
  cookies = {},
  method = 'POST',
}: {
  body?: unknown;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  method?: string;
}) {
  return {
    method,
    body,
    cookies,
    headers: { 'user-agent': PHONE, host: 'codingspacekh.dev', 'x-forwarded-for': '203.0.113.7, 10.0.0.1', ...headers },
    socket: { remoteAddress: '10.0.0.1' },
  } as unknown as NextApiRequest;
}

function res() {
  const r = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
  return r;
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: true, error: null });
});

describe('recording a page view', () => {
  it('sends the path, a hash of address + browser, the source, device and country', async () => {
    const r = req({
      body: { id: ID, path: '/posts/am-gm?ref=x', referrer: 'https://www.google.com/search?q=amgm' },
      headers: { 'x-vercel-ip-country': 'KH' },
    });
    expect(await recordVisit(r)).toBe('recorded');
    expect(rpc).toHaveBeenCalledWith('track_view', {
      p_id: ID,
      p_client: clientHash('203.0.113.7', PHONE),
      p_path: '/posts/am-gm',
      p_source: 'Google',
      p_device: 'mobile',
      p_country: 'KH',
    });
    const sent = rpc.mock.calls[0]![1].p_client as string;
    expect(sent).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('203.0.113.7');
  });

  it('reads a beacon (text/plain) and a reading time', async () => {
    expect(await recordVisit(req({ body: JSON.stringify({ id: ID, seconds: 42 }) }))).toBe('recorded');
    expect(rpc).toHaveBeenCalledWith('track_time', { p_id: ID, p_seconds: 42 });
  });

  it('a link from inside the site and an unknown country have no source / country', async () => {
    await recordVisit(
      req({
        body: { id: ID, path: '/', referrer: 'https://codingspacekh.dev/study/math' },
        headers: { 'x-vercel-ip-country': 'XX' },
      }),
    );
    expect(rpc.mock.calls[0]![1]).toMatchObject({ p_source: null, p_country: null });
  });

  it('ignores robots, the signed-in owner and pages that are not counted', async () => {
    const view = { id: ID, path: '/' };
    expect(await recordVisit(req({ body: view, headers: { 'user-agent': 'Googlebot/2.1' } }))).toBe('ignored');
    expect(await recordVisit(req({ body: view, cookies: { 'sb-abc-auth-token': 'x' } }))).toBe('ignored');
    expect(await recordVisit(req({ body: view, cookies: { 'sb-abc-auth-token.0': 'x' } }))).toBe('ignored');
    expect(await recordVisit(req({ body: { id: ID, path: '/admin/posts' } }))).toBe('ignored');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a view the database refuses (caps, repeats) is ignored', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await recordVisit(req({ body: { id: ID, path: '/' } }))).toBe('ignored');
  });

  it('refuses malformed bodies', async () => {
    for (const body of ['{nope', { id: 'x', path: '/' }, { id: ID }, { id: ID, seconds: 0 }, null])
      expect(await recordVisit(req({ body }))).toBe('invalid');
  });

  it('throws when the database fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'down' } });
    await expect(recordVisit(req({ body: { id: ID, path: '/' } }))).rejects.toThrow('track_view: down');
    await expect(recordVisit(req({ body: { id: ID, seconds: 3 } }))).rejects.toThrow('track_time: down');
  });

  it('the hash changes with the pepper, address or browser', () => {
    expect(clientHash('1.1.1.1', 'a', 'p')).not.toBe(clientHash('1.1.1.2', 'a', 'p'));
    expect(clientHash('1.1.1.1', 'a', 'p')).not.toBe(clientHash('1.1.1.1', 'b', 'p'));
    expect(clientHash('1.1.1.1', 'a', 'p')).not.toBe(clientHash('1.1.1.1', 'a', 'q'));
  });
});

describe('POST /api/visit', () => {
  const call = async (r: NextApiRequest) => {
    const out = res();
    await handler(r, out as unknown as NextApiResponse);
    return out;
  };

  it('answers 204 with no-store', async () => {
    const out = await call(req({ body: { id: ID, path: '/' }, headers: { origin: 'https://codingspacekh.dev' } }));
    expect(out.statusCode).toBe(204);
    expect(out.headers['Cache-Control']).toBe('private, no-store');
  });

  it('only takes POST', async () => {
    const out = await call(req({ method: 'GET' }));
    expect(out.statusCode).toBe(405);
    expect(out.headers.Allow).toBe('POST');
  });

  it('refuses another site, and bad bodies', async () => {
    expect(
      (await call(req({ body: { id: ID, path: '/' }, headers: { origin: 'https://evil.example' } }))).statusCode,
    ).toBe(403);
    expect((await call(req({ body: { id: 'x' } }))).statusCode).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a database failure is logged, never shown to the visitor', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: 'down' } });
    expect((await call(req({ body: { id: ID, path: '/' } }))).statusCode).toBe(204);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
