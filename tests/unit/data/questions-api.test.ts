// @vitest-environment node
const askQuestion = vi.fn();
vi.mock('@/server/data/questions', async (orig) => ({
  ...(await orig<typeof import('@/server/data/questions')>()),
  askQuestion: (...a: unknown[]) => askQuestion(...a),
}));
const getQuestionsPost = vi.fn();
const getQuestionsPage = vi.fn();
vi.mock('@/server/data/public', async (orig) => ({
  ...(await orig<typeof import('@/server/data/public')>()),
  getQuestionsPost: (...a: unknown[]) => getQuestionsPost(...a),
  getQuestionsPage: (...a: unknown[]) => getQuestionsPage(...a),
}));
import handler from '@/pages/api/questions';

function call(opts: {
  method?: string;
  json?: boolean;
  origin?: string;
  body?: unknown;
  query?: Record<string, string>;
}) {
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
  return handler(
    { method: opts.method ?? 'POST', headers, body: opts.body ?? {}, query: opts.query ?? {} } as never,
    res as never,
  ).then(() => out);
}

beforeEach(() => {
  askQuestion.mockReset();
  getQuestionsPost.mockReset();
  getQuestionsPage.mockReset();
});

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
    const life = await call({ origin: 'https://site.test', json: false, body: { post: 'my-week', kind: 'life' } });
    expect(life.redirect).toBe('/posts/my-week?asked=ok#comments');
  });

  it('refuses other sites and other methods', async () => {
    expect(await call({ origin: 'https://evil.test' })).toMatchObject({ status: 403 });
    expect(await call({})).toMatchObject({ status: 403 }); // no Origin at all
    expect(await call({ method: 'PUT', origin: 'https://site.test' })).toMatchObject({ status: 405 });
    expect(askQuestion).not.toHaveBeenCalled();
  });
});

describe('GET /api/questions: older ones for "Show older" (v1.1)', () => {
  const before = '2026-10-18T03:00:00.123456+00:00';

  it('gives the next page under a live post, cached at the CDN for a minute', async () => {
    getQuestionsPost.mockResolvedValue({ id: 'p1', slug: 'am-gm', title: 'AM–GM', kind: 'lesson' });
    getQuestionsPage.mockResolvedValue({ questions: [{ id: 'q9' }], more: 4 });
    const out = await call({ method: 'GET', query: { post: 'am-gm', before } });
    expect(out).toMatchObject({ status: 200, json: { questions: [{ id: 'q9' }], more: 4 } });
    expect(out.headers['Cache-Control']).toBe('public, s-maxage=60, stale-while-revalidate=300');
    expect(getQuestionsPost).toHaveBeenCalledWith('am-gm');
    expect(getQuestionsPage).toHaveBeenCalledWith('p1', before);
  });

  it('refuses a bad slug or cursor, and a post that is not live', async () => {
    expect(await call({ method: 'GET', query: { post: '../x', before } })).toMatchObject({ status: 400 });
    expect(await call({ method: 'GET', query: { post: 'am-gm', before: 'yesterday' } })).toMatchObject({
      status: 400,
    });
    expect(await call({ method: 'GET', query: { post: 'am-gm' } })).toMatchObject({ status: 400 });
    expect(getQuestionsPost).not.toHaveBeenCalled();
    getQuestionsPost.mockResolvedValue(null);
    expect(await call({ method: 'GET', query: { post: 'gone', before } })).toMatchObject({ status: 404 });
    expect(getQuestionsPage).not.toHaveBeenCalled();
  });

  it('does not cache a failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getQuestionsPost.mockRejectedValue(new Error('db down'));
    const out = await call({ method: 'GET', query: { post: 'am-gm', before } });
    expect(out).toMatchObject({ status: 500 });
    expect(out.headers['Cache-Control']).toBe('private, no-store');
  });
});
