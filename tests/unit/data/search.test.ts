// @vitest-environment node
const rpc = vi.fn();
// The menus' subjects come from the database too: none here.
vi.mock('@/server/data/public', () => ({ db: () => ({ rpc }), getSubjects: async () => [] }));
import { allowSearch, clientIp, rateKey, searchPosts } from '@/server/data/search';
import { getServerSideProps } from '@/pages/search';

const req = (headers: Record<string, string>) => ({ headers, socket: { remoteAddress: '10.0.0.9' } }) as never;

beforeEach(() => rpc.mockReset());

describe('search data (03 PUB-09)', () => {
  it('maps rows to results', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          slug: 'a',
          kind: 'lesson',
          subject_id: 'math',
          lang: 'en',
          title: 'A',
          summary: null,
          published_at: '2026-10-01T00:00:00Z',
          snippet: null,
        },
        {
          slug: 'b',
          kind: 'life',
          subject_id: null,
          lang: 'km',
          title: 'B',
          summary: 'S',
          published_at: 'x',
          snippet: 's',
        },
      ],
      error: null,
    });
    expect(await searchPosts('cauchy')).toEqual([
      {
        slug: 'a',
        kind: 'lesson',
        subject: 'math',
        lang: 'en',
        title: 'A',
        summary: '',
        publishedAt: '2026-10-01T00:00:00Z',
        snippet: '',
      },
      { slug: 'b', kind: 'life', subject: null, lang: 'km', title: 'B', summary: 'S', publishedAt: 'x', snippet: 's' },
    ]);
    expect(rpc).toHaveBeenCalledWith('search_posts', { p_q: 'cauchy', p_limit: 20 });
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(searchPosts('x')).rejects.toThrow('search_posts: boom');
  });

  it('takes the visitor address from the first x-forwarded-for entry', () => {
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.7, 10.1.1.1' }))).toBe('203.0.113.7');
    expect(clientIp(req({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(clientIp(req({}))).toBe('10.0.0.9');
  });

  it('keys the rate limit by a salted daily hash, never the address', () => {
    const day = new Date('2026-10-16T10:00:00Z');
    const key = rateKey('203.0.113.7', day, 'salt');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain('203');
    expect(rateKey('203.0.113.7', day, 'salt')).toBe(key);
    expect(rateKey('203.0.113.7', new Date('2026-10-17T10:00:00Z'), 'salt')).not.toBe(key);
    expect(rateKey('203.0.113.8', day, 'salt')).not.toBe(key);
  });

  it('allows a search when the limit check says so, and when the check itself fails', async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await allowSearch('1.2.3.4')).toBe(false);
    rpc.mockResolvedValueOnce({ data: true, error: null });
    expect(await allowSearch('1.2.3.4')).toBe(true);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'down' } });
    expect(await allowSearch('1.2.3.4')).toBe(true);
    log.mockRestore();
  });
});

describe('the /search page', () => {
  function call(q: unknown) {
    const headers: Record<string, string> = {};
    const res = { statusCode: 200, setHeader: (k: string, v: string) => (headers[k] = v) };
    const out = getServerSideProps({ query: { q }, req: req({}), res } as never);
    return { out, res, headers };
  }

  it('without a query: an empty page, cached for an hour, no database call', async () => {
    const { out, headers } = call(undefined);
    expect(await out).toEqual({ props: { q: '', results: null, limited: false, subjects: [] } });
    expect(headers['Cache-Control']).toMatch(/s-maxage=3600/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('searches and caches the answer at the CDN for five minutes', async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: [], error: null });
    const { out, headers, res } = call('  cauchy ');
    expect(await out).toEqual({ props: { q: 'cauchy', results: [], limited: false, subjects: [] } });
    expect(res.statusCode).toBe(200);
    expect(headers['Cache-Control']).toBe('public, s-maxage=300, stale-while-revalidate=600');
  });

  it('answers 429, uncached, after too many searches', async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    const { out, headers, res } = call('cauchy');
    expect(await out).toEqual({ props: { q: 'cauchy', results: null, limited: true, subjects: [] } });
    expect(res.statusCode).toBe(429);
    expect(headers['Cache-Control']).toBe('no-store');
    expect(headers['Retry-After']).toBe('60');
    expect(rpc).toHaveBeenCalledTimes(1); // no search after a refusal
  });
});
