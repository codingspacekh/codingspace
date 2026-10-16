import { neighbours } from '@/lib/lesson-nav';

const lessons = [
  { slug: 'a', title: 'A' },
  { slug: 'b', title: 'B' },
  { slug: 'c', title: 'C' },
];

describe('neighbours', () => {
  it('finds the previous and next lesson in section order', () => {
    expect(neighbours(lessons, 'b')).toEqual({ prev: lessons[0], next: lessons[2] });
  });

  it('has no previous lesson at the start and no next lesson at the end', () => {
    expect(neighbours(lessons, 'a')).toEqual({ prev: null, next: lessons[1] });
    expect(neighbours(lessons, 'c')).toEqual({ prev: lessons[1], next: null });
  });

  it('returns nothing for a post outside the list (life posts)', () => {
    expect(neighbours(lessons, 'zzz')).toEqual({ prev: null, next: null });
  });
});
