import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { revalidate, sendError } from '@/server/admin/http';
import { ApiError } from '@/server/admin/errors';

function fakeRes(revalidateImpl: (p: string) => Promise<void> = async () => {}) {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    revalidate: vi.fn(revalidateImpl),
  };
  return res;
}
const as = (r: ReturnType<typeof fakeRes>) => r as unknown as NextApiResponse;

describe('sendError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a refused change with its status and reason', () => {
    const res = fakeRes();
    sendError(as(res), new ApiError(409, 'the post changed since revision 2'));
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'the post changed since revision 2' });
  });
  it('bad input is 400', () => {
    const res = fakeRes();
    sendError(as(res), z.uuid().safeParse('x').error);
    expect(res.statusCode).toBe(400);
  });
  it('anything else is a 500 that reveals nothing', () => {
    const res = fakeRes();
    sendError(as(res), new Error('connection string postgres://secret'));
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'server_error' });
  });
});

describe('revalidate', () => {
  it('rebuilds every page and reports the ones that failed, without throwing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = fakeRes(async (p) => {
      if (p === '/study/math') throw new Error('timeout');
    });
    expect(await revalidate(as(res), ['/posts/x', '/', '/study/math'])).toEqual({ failed: ['/study/math'] });
    expect(res.revalidate).toHaveBeenCalledTimes(3);
    vi.restoreAllMocks();
  });
});
