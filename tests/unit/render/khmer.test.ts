import { renderContent } from '@/server/render';

// PUB-08: Khmer posts must come through the renderer unchanged.
const KHMER = 'សមីការដឺក្រេទីពីរ'; // "quadratic equation"
const SENTENCE = 'យើងនឹងដោះស្រាយសមីការនេះជាមួយគ្នា'; // "we will solve this equation together"

const doc = (...content: unknown[]) => ({ type: 'doc', content });

describe('renderer: Khmer round-trip', () => {
  it('keeps Khmer text byte-for-byte in the body and the search text', async () => {
    const out = await renderContent(doc({ type: 'paragraph', content: [{ type: 'text', text: SENTENCE }] }));
    expect(out.html).toBe(`<p>${SENTENCE}</p>`);
    expect(out.searchText).toBe(SENTENCE);
  });

  it('keeps Khmer letters and combining marks in heading ids and the TOC', async () => {
    const out = await renderContent(
      doc({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: KHMER }] }),
    );
    expect(out.html).toBe(`<h2 id="${KHMER}">${KHMER}</h2>`);
    expect(out.toc).toEqual([{ id: KHMER, text: KHMER, level: 2 }]);
  });

  it('counts Khmer words without spaces for reading time', async () => {
    // ~600 Khmer words with no spaces between them must not count as one word.
    const long = SENTENCE.repeat(120);
    const out = await renderContent(doc({ type: 'paragraph', content: [{ type: 'text', text: long }] }), {
      lang: 'km',
    });
    expect(out.readingMinutes).toBeGreaterThan(1);
  });
});
