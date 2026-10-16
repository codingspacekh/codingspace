import { markdownToDoc } from '@/server/content/markdown';

// The import script must produce the same JSON the editor will (D6, schema.ts).
const blocks = (md: string) => markdownToDoc(md).doc.content;
const t = (text: string, ...marks: object[]) => ({ type: 'text', text, ...(marks.length ? { marks } : {}) });
const p = (...content: object[]) => ({ type: 'paragraph', content });

describe('markdownToDoc: text', () => {
  it('converts paragraphs and inline marks', () => {
    expect(blocks('Plain **bold** *italic* ~~gone~~ `code`')).toEqual([
      p(
        t('Plain '),
        t('bold', { type: 'bold' }),
        t(' '),
        t('italic', { type: 'italic' }),
        t(' '),
        t('gone', { type: 'strike' }),
        t(' '),
        t('code', { type: 'code' }),
      ),
    ]);
  });

  it('stacks nested marks', () => {
    expect(blocks('***both***')).toEqual([p(t('both', { type: 'italic' }, { type: 'bold' }))]);
  });

  it('turns links into link marks and keeps the href as written', () => {
    expect(blocks('[next](/posts/am-gm) and [site](https://example.com)')).toEqual([
      p(
        t('next', { type: 'link', attrs: { href: '/posts/am-gm' } }),
        t(' and '),
        t('site', { type: 'link', attrs: { href: 'https://example.com' } }),
      ),
    ]);
  });

  it('converts hard line breaks', () => {
    expect(blocks('a  \nb')).toEqual([p(t('a'), { type: 'hardBreak' }, t('b'))]);
  });

  it('maps headings to levels 2–4', () => {
    expect(blocks('# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five')).toEqual(
      [2, 2, 3, 4, 4].map((level, i) => ({
        type: 'heading',
        attrs: { level },
        content: [t(['One', 'Two', 'Three', 'Four', 'Five'][i]!)],
      })),
    );
  });
});

describe('markdownToDoc: maths and code', () => {
  it('converts inline and display maths', () => {
    expect(blocks('So $a^2 \\ge 0$.\n\n$$\n\\frac{a+b}{2}\n$$')).toEqual([
      p(t('So '), { type: 'mathInline', attrs: { latex: 'a^2 \\ge 0' } }, t('.')),
      { type: 'mathBlock', attrs: { latex: '\\frac{a+b}{2}' } },
    ]);
  });

  it('treats one-line $$…$$ on its own line as display maths', () => {
    expect(blocks('$$\\frac{a+b}{2} \\ge \\sqrt{ab},$$')).toEqual([
      { type: 'mathBlock', attrs: { latex: '\\frac{a+b}{2} \\ge \\sqrt{ab},' } },
    ]);
  });

  it('keeps $$…$$ inside a sentence inline', () => {
    expect(blocks('so $$x$$ holds')).toEqual([p(t('so '), { type: 'mathInline', attrs: { latex: 'x' } }, t(' holds'))]);
  });

  it('converts fenced code with its language', () => {
    expect(blocks('```python\nprint(1)\n```')).toEqual([
      { type: 'codeBlock', attrs: { language: 'python' }, content: [t('print(1)')] },
    ]);
  });

  it('keeps code without a language as plain text', () => {
    expect(blocks('```\nx ← 1\n```')).toEqual([
      { type: 'codeBlock', attrs: { language: null }, content: [t('x ← 1')] },
    ]);
  });
});

describe('markdownToDoc: blocks', () => {
  it('converts bullet and ordered lists, keeping the start number', () => {
    expect(blocks('- a\n- b\n\n3. c')).toEqual([
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [p(t('a'))] },
          { type: 'listItem', content: [p(t('b'))] },
        ],
      },
      { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [p(t('c'))] }] },
    ]);
  });

  it('converts blockquotes and thematic breaks', () => {
    expect(blocks('> quoted\n\n---')).toEqual([
      { type: 'blockquote', content: [p(t('quoted'))] },
      { type: 'horizontalRule' },
    ]);
  });

  it.each([
    ['NOTE', 'note'],
    ['CONTEST-TIP', 'contest-tip'],
    ['EXAM-TIP', 'exam-tip'],
    ['WARNING', 'warning'],
  ])('turns a [!%s] blockquote into a %s callout', (marker, variant) => {
    expect(blocks(`> [!${marker}]\n> Look **here**.`)).toEqual([
      { type: 'callout', attrs: { variant }, content: [p(t('Look '), t('here', { type: 'bold' }), t('.'))] },
    ]);
  });

  it('converts GFM tables with a header row', () => {
    const cell = (type: string, text: string) => ({ type, content: [p(t(text))] });
    expect(blocks('| Type | Example |\n|---|---|\n| `int` | 42 |')).toEqual([
      {
        type: 'table',
        content: [
          { type: 'tableRow', content: [cell('tableHeader', 'Type'), cell('tableHeader', 'Example')] },
          {
            type: 'tableRow',
            content: [{ type: 'tableCell', content: [p(t('int', { type: 'code' }))] }, cell('tableCell', '42')],
          },
        ],
      },
    ]);
  });

  it('turns a paragraph holding only an image into an image block', () => {
    expect(blocks('![A triangle](https://files.codingspace.io/a.png "Figure 1")')).toEqual([
      { type: 'image', attrs: { src: 'https://files.codingspace.io/a.png', alt: 'A triangle', caption: 'Figure 1' } },
    ]);
  });
});

describe('markdownToDoc: what it will not convert', () => {
  it('drops raw HTML and reports it', () => {
    const { doc, warnings } = markdownToDoc('<script>alert(1)</script>\n\ntext <b>x</b>');
    expect(JSON.stringify(doc)).not.toContain('script');
    expect(doc.content).toEqual([p(t('text '), t('x'))]);
    expect(warnings).toEqual([
      'raw HTML is not supported and was removed (line 1)',
      'raw HTML is not supported and was removed (line 3)',
    ]);
  });

  it('reports images inside a line of text', () => {
    const { warnings } = markdownToDoc('see ![x](https://files.codingspace.io/a.png) here');
    expect(warnings).toEqual(['images must be on their own line (line 1)']);
  });
});
