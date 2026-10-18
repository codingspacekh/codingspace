import { getDone, markDone, MAX_DONE, progressOf, unmarkDone } from '@/ui/done-store';

// v1.1: lessons marked done, kept in this browser only (like saved lessons).
describe('done lessons', () => {
  it('marks and unmarks, newest last, in localStorage only', () => {
    markDone('vectors', new Date('2026-10-18T01:00:00Z'));
    markDone('forces', new Date('2026-10-18T02:00:00Z'));
    markDone('vectors', new Date('2026-10-18T03:00:00Z'));
    expect(Object.keys(getDone())).toEqual(['forces', 'vectors']);
    expect(getDone().vectors).toBe('2026-10-18T03:00:00.000Z');
    expect(getDone()).toBe(getDone()); // the same object while nothing changes
    unmarkDone('forces');
    expect(JSON.parse(localStorage.getItem('cs-done')!)).toEqual({
      v: 1,
      items: { vectors: '2026-10-18T03:00:00.000Z' },
    });
  });

  it('ignores a damaged or tampered list', () => {
    localStorage.setItem('cs-done', '{not json');
    expect(getDone()).toEqual({});
    localStorage.setItem('cs-done', JSON.stringify({ v: 1, items: { ok: 'x', 'Bad Slug': 'x', n: 3 } }));
    expect(getDone()).toEqual({ ok: 'x' });
    localStorage.setItem('cs-done', JSON.stringify({ v: 1, items: ['a'] }));
    expect(getDone()).toEqual({});
  });

  it(`keeps at most ${MAX_DONE}, dropping the oldest`, () => {
    const items = Object.fromEntries(Array.from({ length: MAX_DONE }, (_, i) => [`l${i}`, 'x']));
    localStorage.setItem('cs-done', JSON.stringify({ v: 1, items }));
    markDone('newest');
    const kept = Object.keys(getDone());
    expect(kept).toHaveLength(MAX_DONE);
    expect(kept[0]).toBe('l1');
    expect(kept.at(-1)).toBe('newest');
  });

  it('works for the page even when storage is blocked', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    markDone('vectors');
    expect(getDone()).toHaveProperty('vectors');
    set.mockRestore();
    unmarkDone('vectors');
  });

  it('counts progress and finds where to continue', () => {
    const slugs = ['a', 'b', 'c'];
    expect(progressOf(slugs, {})).toEqual({ done: 0, total: 3, next: 0 });
    expect(progressOf(slugs, { a: 'x', c: 'x' })).toEqual({ done: 2, total: 3, next: 1 });
    expect(progressOf(slugs, { a: 'x', b: 'x', c: 'x', z: 'x' })).toEqual({ done: 3, total: 3, next: null });
  });
});
