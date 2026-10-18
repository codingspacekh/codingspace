import { isSlug, SLUG } from '@/lib/slug';

describe('slugs', () => {
  it('are lowercase words of letters and digits joined by single hyphens', () => {
    for (const ok of ['a', 'am-gm', 'am-gm-inequality', '9618-paper-1', 'x2'])
      expect([ok, isSlug(ok), SLUG.test(ok)]).toEqual([ok, true, true]);
    for (const bad of ['', 'Am-gm', 'am--gm', '-am', 'am-', 'am gm', 'am_gm', '../x', 'ám', 'am/gm'])
      expect([bad, isSlug(bad)]).toEqual([bad, false]);
  });

  it('are only ever strings', () => {
    for (const v of [null, undefined, 1, ['a'], { toString: () => 'a' }]) expect(isSlug(v)).toBe(false);
  });
});
