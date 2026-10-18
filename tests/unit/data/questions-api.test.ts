// @vitest-environment node
const askQuestion = vi.fn();
vi.mock('@/server/data/questions', async (orig) => ({
  ...(await orig<typeof import('@/server/data/questions')>()),
  askQuestion: (...a: unknown[]) => askQuestion(...a),
}));
import handler from '@/pages/api/questions';

function call(opts: { method?: string; json?: boolean; origin?: string; body?: unknown }) {
  const headers: Record<string, string> = {
    host: 'site.test',
    'content-type': opts.json === false ? 'application/x-www-form-urlencoded' : 'application/json',
  };
  if (opts.origin !== undefined) headers.origin = opts.origin;
  const out = { status: 0, json: undefined as unknown, redirect: '', headers: {} as Record<string, string> };
  const res = {
    setHeader: (k: string, v: string) => (out.headers[k] = v),
    status(code: number) {
      out.status = code;
      return this;
    },
    json(body: unknown) {
      out.json = body;
      return this;
    },
    redirect(code: number, url: string) {
      out.status = code;
      out.redirect = url;
      return this;
    },
  };
  return handler({ method: opts.method ?? 'POST', headers, body: opts.body ?? {} } as never, res as never).then(
    () => out,
  );
}

beforeEach(() => askQuestion.mockReset());

describe('POST /api/questions (v1.1)', () => {
  it('answers the page’s script in JSON', async () => {
    askQuestion.mockResolvedValue('ok');
    expect(await call({ origin: 'https://site.test' })).toMatchObject({ status: 200, json: { result: 'ok' } });
    askQuestion.mockResolvedValue('limited');
    expect(await call({ origin: 'https://site.test' })).toMatchObject({ status: 429, json: { result: 'limited' } });
  });

  it('sends a plain form post back to the lesson with the result', async () => {
    askQuestion.mockResolvedValue('ok');
    const out = await call({ origin: 'https://site.test', json: false, body: { post: 'am-gm' } });
    expect(out).toMatchObject({ status: 303, redirect: '/posts/am-gm?asked=ok#questions' });
    const bad = await call({ origin: 'https://site.test', json: false, body: { post: '../x' } });
    expect(bad.redirect).toBe('/?asked=ok#questions');
  });

  it('refuses other sites and other methods', async () => {
    expect(await call({ origin: 'https://evil.test' })).toMatchObject({ status: 403 });
    expect(await call({})).toMatchObject({ status: 403 }); // no Origin at all
    expect(await call({ method: 'GET', origin: 'https://site.test' })).toMatchObject({ status: 405 });
    expect(askQuestion).not.toHaveBeenCalled();
  });
});
