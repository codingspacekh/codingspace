import { formatDate, levelLabel, postMeta } from '@/lib/format';

describe('formatDate', () => {
  it('shows day, short month and year in Cambodia time, the same on server and client', () => {
    expect(formatDate('2026-10-12T20:00:00Z')).toBe('13 Oct 2026'); // already the 13th in Phnom Penh
  });
});

describe('levelLabel', () => {
  it.each([
    [1, 'Beginner'],
    [2, 'Intermediate'],
    [3, 'Advanced'],
  ])('level %i is %s', (level, label) => {
    expect(levelLabel(level)).toBe(label);
  });
});

describe('postMeta', () => {
  it('joins date, reading time and problem count', () => {
    expect(postMeta({ publishedAt: '2026-10-12T00:00:00Z', minutes: 9, problemCount: 4 })).toBe(
      'Published 12 Oct 2026 · 9 min read · 4 practice problems',
    );
  });

  it('uses the singular and leaves out zero problems', () => {
    expect(postMeta({ publishedAt: '2026-10-12T00:00:00Z', minutes: 1, problemCount: 1 })).toBe(
      'Published 12 Oct 2026 · 1 min read · 1 practice problem',
    );
    expect(postMeta({ publishedAt: '2026-10-12T00:00:00Z', minutes: 3, problemCount: 0 })).toBe(
      'Published 12 Oct 2026 · 3 min read',
    );
  });
});
