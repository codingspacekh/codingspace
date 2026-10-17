import { moveItem, postSlug, publishChecklist, revalidationPaths, scheduleProblem } from '@/lib/post-rules';

describe('postSlug', () => {
  it('makes a URL slug from an English title', () => {
    expect(postSlug('The AM–GM Inequality!', 'x')).toBe('the-am-gm-inequality');
    expect(postSlug('  Big-O   & Θ notation ', 'x')).toBe('big-o-notation');
  });
  it('drops accents', () => {
    expect(postSlug('Cauchy–Schwarz für Anfänger', 'x')).toBe('cauchy-schwarz-fur-anfanger');
  });
  it('keeps slugs short, cutting at a word', () => {
    const slug = postSlug('a very long title '.repeat(10), 'x');
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(slug.endsWith('-')).toBe(false);
  });
  it('falls back for titles with no Latin letters (Khmer)', () => {
    expect(postSlug('វិសមភាព AM–GM', 'lesson-2026-10-16')).toBe('am-gm');
    expect(postSlug('វិសមភាព', 'lesson-2026-10-16')).toBe('lesson-2026-10-16');
    expect(postSlug('', 'life-2026-10-16')).toBe('life-2026-10-16');
  });
});

const doc = (...content: unknown[]) => ({ type: 'doc', content });
const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const base = {
  kind: 'lesson' as const,
  title: 'AM–GM',
  summary: 'Means',
  section_id: 's1',
  content_json: doc(p('Hi')),
};
const failing = (c: ReturnType<typeof publishChecklist>) => c.items.filter((i) => !i.ok).map((i) => i.id);

describe('publishChecklist (ADM-07)', () => {
  it('is ready when title, body and section are there', () => {
    const c = publishChecklist(base);
    expect(c.ready).toBe(true);
    expect(failing(c)).toEqual([]);
  });
  it('requires a title, a body and (for lessons) a section', () => {
    const c = publishChecklist({ ...base, title: '   ', section_id: null, content_json: doc({ type: 'paragraph' }) });
    expect(c.ready).toBe(false);
    expect(failing(c)).toEqual(['title', 'body', 'section']);
  });
  it('life posts need no section', () => {
    expect(publishChecklist({ ...base, kind: 'life', section_id: null }).ready).toBe(true);
    expect(publishChecklist({ ...base, kind: 'life' }).items.map((i) => i.id)).not.toContain('section');
  });
  it('a body can be maths, code, an image… not only text', () => {
    expect(publishChecklist({ ...base, content_json: doc({ type: 'mathBlock', attrs: { latex: 'x' } }) }).ready).toBe(
      true,
    );
    expect(publishChecklist({ ...base, content_json: {} }).ready).toBe(false);
  });
  it('recommends a summary and alt text, without blocking', () => {
    const img = { type: 'image', attrs: { src: 'https://files.codingspacekh.dev/a.webp', alt: '' } };
    const c = publishChecklist({
      ...base,
      summary: '',
      content_json: doc(p('x'), { type: 'callout', attrs: { variant: 'note' }, content: [img] }),
    });
    expect(c.ready).toBe(true);
    expect(failing(c)).toEqual(['summary', 'alt']);
    expect(c.items.find((i) => i.id === 'alt')!.required).toBe(false);
  });
});

describe('scheduleProblem', () => {
  const now = new Date('2026-10-16T08:00:00Z');
  it('needs a time at least a minute ahead and within a year', () => {
    expect(scheduleProblem(new Date('2026-10-16T08:00:30Z'), now)).toBe('too_soon');
    expect(scheduleProblem(new Date('2026-10-15T08:00:00Z'), now)).toBe('too_soon');
    expect(scheduleProblem(new Date('2027-10-17T08:00:00Z'), now)).toBe('too_far');
    expect(scheduleProblem(new Date('invalid'), now)).toBe('invalid');
    expect(scheduleProblem(new Date('2026-10-16T09:00:00Z'), now)).toBeNull();
  });
});

describe('revalidationPaths', () => {
  it('a lesson: its page, home and its subject', () => {
    expect(revalidationPaths({ slug: 'am-gm', kind: 'lesson', subject: 'math', previous_subject: null })).toEqual([
      '/posts/am-gm',
      '/',
      '/study/math',
    ]);
  });
  it('a lesson that moved subject also refreshes the old subject page', () => {
    expect(revalidationPaths({ slug: 'x', kind: 'lesson', subject: 'physics', previous_subject: 'math' })).toContain(
      '/study/math',
    );
  });
  it('also rebuilds the other lessons in the section (their prev/next links and section list)', () => {
    expect(
      revalidationPaths({ slug: 'am-gm', kind: 'lesson', subject: 'math' }, ['cauchy', 'am-gm', 'jensen']),
    ).toEqual(['/posts/am-gm', '/', '/study/math', '/posts/cauchy', '/posts/jensen']);
  });

  it('a life post refreshes the Author page instead', () => {
    expect(revalidationPaths({ slug: 'hello', kind: 'life', subject: null })).toEqual(['/posts/hello', '/', '/author']);
  });
});

describe('moveItem', () => {
  it('swaps with the neighbour, and does nothing at the ends', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a'], 5, 1)).toEqual(['a']);
  });
  it('never mutates the input', () => {
    const list = ['a', 'b'];
    moveItem(list, 0, 1);
    expect(list).toEqual(['a', 'b']);
  });
});
