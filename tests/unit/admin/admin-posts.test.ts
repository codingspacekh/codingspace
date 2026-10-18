import { postFilters, postStatus, searchPattern } from '@/lib/admin-posts';

describe('postFilters (posts list query string)', () => {
  it('reads search, type, subject and status', () => {
    expect(postFilters({ q: ' am-gm ', kind: 'lesson', subject: 'math', status: 'changes' })).toEqual({
      q: 'am-gm',
      kind: 'lesson',
      subject: 'math',
      status: 'changes',
    });
  });
  it('ignores empty and unknown values instead of failing the page', () => {
    expect(postFilters({ q: '', kind: 'poem', subject: '', status: ['draft', 'x'] })).toEqual({});
    expect(postFilters({ q: 'x'.repeat(300) }).q).toHaveLength(100);
  });
});

describe('searchPattern', () => {
  it('matches anywhere, case-insensitively', () => {
    expect(searchPattern('AM GM')).toBe('%AM GM%');
  });
  it('strips characters that would change the PostgREST filter or act as wildcards', () => {
    expect(searchPattern('a,b(c)d%e*f\\g"h')).toBe('%a b c d e f g h%');
    expect(searchPattern(',,,')).toBeNull();
    expect(searchPattern('x'.repeat(300))!.length).toBe(102);
  });
});

describe('postStatus', () => {
  it('names what the owner needs to know', () => {
    expect(postStatus({ status: 'draft', has_unpublished_changes: false })).toBe('Draft');
    expect(postStatus({ status: 'scheduled', has_unpublished_changes: false })).toBe('Scheduled');
    expect(postStatus({ status: 'published', has_unpublished_changes: false })).toBe('Published');
    expect(postStatus({ status: 'published', has_unpublished_changes: true })).toBe('Unpublished changes');
  });
});
