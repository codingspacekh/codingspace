import { cleanQuery, snippetParts } from '@/lib/search-text';

const S = '\u0002';
const E = '\u0003';

describe('search snippets (03 PUB-09)', () => {
  it('splits marked matches from plain text', () => {
    expect(snippetParts(`The ${S}Cauchy${E} inequality and ${S}Cauchy${E}.`)).toEqual([
      { text: 'The ', match: false },
      { text: 'Cauchy', match: true },
      { text: ' inequality and ', match: false },
      { text: 'Cauchy', match: true },
      { text: '.', match: false },
    ]);
  });

  it('keeps markup as text (never HTML) and survives stray markers', () => {
    expect(snippetParts(`<img src=x onerror=alert(1)> ${S}x`)).toEqual([
      { text: '<img src=x onerror=alert(1)> ', match: false },
      { text: 'x', match: true },
    ]);
    expect(snippetParts(`a${E}b`)).toEqual([{ text: 'ab', match: false }]);
    expect(snippetParts('')).toEqual([]);
  });

  it('cleans the query: trimmed, at most 100 characters, strings only', () => {
    expect(cleanQuery('  cauchy  ')).toBe('cauchy');
    expect(cleanQuery('x'.repeat(150))).toHaveLength(100);
    expect(cleanQuery(['a', 'b'])).toBe('');
    expect(cleanQuery(undefined)).toBe('');
  });
});
