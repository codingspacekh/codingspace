import { act, render, screen } from '@testing-library/react';
import { getSaved, MAX_SAVED, savePost, unsavePost, useSaved } from '@/ui/saved-store';

const post = (slug: string, title = slug) => ({ slug, title, subject: 'math', lang: 'en' as const });
const stored = () => JSON.parse(window.localStorage.getItem('cs-saved') ?? 'null');

afterEach(() => vi.restoreAllMocks());

describe('saved lessons, in this browser only', () => {
  it('saves newest first, with the time, and saving again moves it to the top', () => {
    savePost(post('a'), new Date('2026-10-18T01:00:00Z'));
    savePost(post('b'), new Date('2026-10-18T02:00:00Z'));
    expect(getSaved().map((p) => p.slug)).toEqual(['b', 'a']);
    savePost(post('a', 'A renamed'), new Date('2026-10-18T03:00:00Z'));
    expect(getSaved()).toEqual([
      { slug: 'a', title: 'A renamed', subject: 'math', lang: 'en', savedAt: '2026-10-18T03:00:00.000Z' },
      { slug: 'b', title: 'b', subject: 'math', lang: 'en', savedAt: '2026-10-18T02:00:00.000Z' },
    ]);
    expect(stored()).toMatchObject({ v: 1, items: [{ slug: 'a' }, { slug: 'b' }] });
  });

  it('removes one, and keeps at most MAX_SAVED', () => {
    for (let i = 0; i <= MAX_SAVED; i++) savePost(post(`p${i}`));
    expect(getSaved()).toHaveLength(MAX_SAVED);
    expect(getSaved()[0]!.slug).toBe(`p${MAX_SAVED}`);
    unsavePost(`p${MAX_SAVED}`);
    expect(getSaved().some((p) => p.slug === `p${MAX_SAVED}`)).toBe(false);
  });

  it('returns the same list while nothing changes (useSyncExternalStore needs that)', () => {
    savePost(post('a'));
    expect(getSaved()).toBe(getSaved());
  });

  it('ignores what it did not write: bad JSON, odd entries', () => {
    window.localStorage.setItem('cs-saved', '{not json');
    expect(getSaved()).toEqual([]);
    window.localStorage.setItem(
      'cs-saved',
      JSON.stringify({
        v: 1,
        items: [
          { slug: 'ok', title: 'OK', subject: null, lang: 'km', savedAt: 'x' },
          { slug: 'Bad Slug', title: 'x', subject: null, lang: 'en', savedAt: 'x' },
          { slug: 'js', title: 'x', subject: 'math', lang: 'fr', savedAt: 'x' },
          'nope',
        ],
      }),
    );
    expect(getSaved().map((p) => p.slug)).toEqual(['ok']);
  });

  it('still works on this page when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    savePost(post('a'));
    expect(getSaved().map((p) => p.slug)).toEqual(['a']);
    unsavePost('a');
    expect(getSaved()).toEqual([]);
  });

  it('asks the browser to keep the list', () => {
    const persist = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, 'storage', { configurable: true, value: { persist } });
    savePost(post('a'));
    expect(persist).toHaveBeenCalled();
  });

  it('components follow changes, from this tab and from others', () => {
    function Count() {
      return <p>{useSaved().length} saved</p>;
    }
    render(<Count />);
    expect(screen.getByText('0 saved')).toBeInTheDocument();
    act(() => savePost(post('a')));
    expect(screen.getByText('1 saved')).toBeInTheDocument();
    // Another tab wrote to storage.
    act(() => {
      window.localStorage.setItem('cs-saved', JSON.stringify({ v: 1, items: [] }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'cs-saved' }));
    });
    expect(screen.getByText('0 saved')).toBeInTheDocument();
  });
});
