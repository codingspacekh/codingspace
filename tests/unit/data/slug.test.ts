// @vitest-environment node
import { isPostSlug } from '@/server/data/public';

// A post page only queries the database for a slug that could really exist (matches posts.slug).
// Anything else is a 404 before the query, so an injection-shaped address can't reach the WAF
// in front of the database and come back as a 500.
describe('isPostSlug', () => {
  it('accepts real slugs', () => {
    for (const s of ['am-gm-inequality', 'bubble-sort', 'why-i-started', 'a', 'post2026', '2x2']) {
      expect(isPostSlug(s), s).toBe(true);
    }
  });

  it('rejects anything that cannot be a slug', () => {
    for (const s of [
      "x' OR 1=1--", // the injection probe that was 500ing
      'Caps',
      'has space',
      'trailing-',
      '-leading',
      'a--b',
      'a_b',
      'a/b',
      'a.b',
      '',
      '../etc',
      'x%27',
    ]) {
      expect(isPostSlug(s), s).toBe(false);
    }
  });
});
