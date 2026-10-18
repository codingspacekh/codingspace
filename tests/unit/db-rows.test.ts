// @vitest-environment node
import { allRows, PAGE_ROWS } from '@/server/db-rows';

/** A fake table of n rows, served PAGE_ROWS at a time like the API. */
const table = (n: number) => {
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: Array.from({ length: Math.max(0, Math.min(n, to + 1) - from) }, (_, i) => from + i), error: null };
  };
  return { page, calls };
};

describe('allRows: past the API’s 1000-row limit', () => {
  it('reads every row, a page at a time', async () => {
    const t = table(2 * PAGE_ROWS + 5);
    const { data } = await allRows(t.page);
    expect(data).toHaveLength(2 * PAGE_ROWS + 5);
    expect(data!.at(-1)).toBe(2 * PAGE_ROWS + 4);
    expect(t.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('asks once for a short list, and once more when the last page was exactly full', async () => {
    const short = table(3);
    expect((await allRows(short.page)).data).toEqual([0, 1, 2]);
    expect(short.calls).toHaveLength(1);
    const full = table(PAGE_ROWS);
    expect((await allRows(full.page)).data).toHaveLength(PAGE_ROWS);
    expect(full.calls).toHaveLength(2);
  });

  it('answers the first error like a single query would', async () => {
    const error = { code: '42501', message: 'no' };
    const out = await allRows(async (from) =>
      from === 0 ? { data: new Array(PAGE_ROWS).fill(1), error: null } : { data: null, error },
    );
    expect(out).toEqual({ data: null, error });
  });
});
