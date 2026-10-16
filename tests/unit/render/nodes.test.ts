import { renderContent } from '@/server/render';

const p = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (t: string, ...marks: unknown[]) => ({ type: 'text', text: t, ...(marks.length ? { marks } : {}) });
const doc = (...content: unknown[]) => ({ type: 'doc', content });
const html = async (...content: unknown[]) => (await renderContent(doc(...content))).html;

describe('renderer: text and marks', () => {
  it('renders paragraphs, hard breaks and nested marks in a stable order', async () => {
    expect(await html(p(text('a'), { type: 'hardBreak' }, text('b', { type: 'italic' }, { type: 'bold' })))).toBe(
      '<p>a<br><strong><em>b</em></strong></p>',
    );
  });

  it.each([
    ['bold', '<strong>x</strong>'],
    ['italic', '<em>x</em>'],
    ['underline', '<u>x</u>'],
    ['strike', '<s>x</s>'],
    ['code', '<code>x</code>'],
  ])('renders the %s mark', async (mark, out) => {
    expect(await html(p(text('x', { type: mark })))).toBe(`<p>${out}</p>`);
  });

  it('renders https and mailto links with safe rel attributes', async () => {
    expect(await html(p(text('x', { type: 'link', attrs: { href: 'https://example.com/a?b=1&c=2' } })))).toBe(
      '<p><a href="https://example.com/a?b=1&amp;c=2" rel="noopener noreferrer">x</a></p>',
    );
    expect(await html(p(text('x', { type: 'link', attrs: { href: 'mailto:hi@codingspace.io' } })))).toBe(
      '<p><a href="mailto:hi@codingspace.io">x</a></p>',
    );
  });

  it('renders site-relative links without rel', async () => {
    expect(await html(p(text('next', { type: 'link', attrs: { href: '/posts/am-gm' } })))).toBe(
      '<p><a href="/posts/am-gm">next</a></p>',
    );
  });

  it('drops empty paragraphs', async () => {
    expect(await html(p(), p(text('')))).toBe('');
  });
});

describe('renderer: blocks', () => {
  it('renders headings h2–h4 with unique ids and clamps other levels', async () => {
    const out = await html(
      { type: 'heading', attrs: { level: 2 }, content: [text('Worked example')] },
      { type: 'heading', attrs: { level: 2 }, content: [text('Worked example')] },
      { type: 'heading', attrs: { level: 1 }, content: [text('Too big')] },
      { type: 'heading', attrs: { level: 6 }, content: [text('Too small')] },
    );
    expect(out).toBe(
      '<h2 id="worked-example">Worked example</h2>' +
        '<h2 id="worked-example-2">Worked example</h2>' +
        '<h2 id="too-big">Too big</h2>' +
        '<h4 id="too-small">Too small</h4>',
    );
  });

  it('renders bullet and ordered lists, keeping a valid start', async () => {
    const item = (t: string) => ({ type: 'listItem', content: [p(text(t))] });
    expect(await html({ type: 'bulletList', content: [item('a'), item('b')] })).toBe(
      '<ul><li><p>a</p></li><li><p>b</p></li></ul>',
    );
    expect(await html({ type: 'orderedList', attrs: { start: 3 }, content: [item('c')] })).toBe(
      '<ol start="3"><li><p>c</p></li></ol>',
    );
    expect(await html({ type: 'orderedList', attrs: { start: 1 }, content: [item('a')] })).toBe(
      '<ol><li><p>a</p></li></ol>',
    );
  });

  it('renders blockquotes and dividers', async () => {
    expect(await html({ type: 'blockquote', content: [p(text('q'))] }, { type: 'horizontalRule' })).toBe(
      '<blockquote><p>q</p></blockquote><hr>',
    );
  });

  it.each([
    ['note', 'Note'],
    ['contest-tip', 'Contest tip'],
    ['exam-tip', 'Exam tip'],
    ['warning', 'Warning'],
  ])('renders the %s callout with its label', async (variant, label) => {
    expect(await html({ type: 'callout', attrs: { variant }, content: [p(text('x'))] })).toBe(
      `<aside class="callout callout--${variant}" role="note"><p class="callout-label">${label}</p><p>x</p></aside>`,
    );
  });

  it('falls back to a note for an unknown callout variant', async () => {
    expect(await html({ type: 'callout', attrs: { variant: 'party' }, content: [p(text('x'))] })).toContain(
      'class="callout callout--note"',
    );
  });
});

describe('renderer: maths', () => {
  it('renders inline and display maths with KaTeX on the server', async () => {
    const out = await renderContent(
      doc(p(text('so '), { type: 'mathInline', attrs: { latex: 'a^2+b^2\\ge 2ab' } }), {
        type: 'mathBlock',
        attrs: { latex: '\\sum_{k=1}^n k = \\frac{n(n+1)}{2}' },
      }),
    );
    expect(out.hasMath).toBe(true);
    expect(out.html).toMatch(/^<p>so <span class="katex">/);
    expect(out.html).toContain('<div class="math-block"><span class="katex-display">');
    expect(out.html).toContain('<math'); // MathML for screen readers
  });

  it('shows invalid LaTeX as an error instead of failing the publish', async () => {
    const out = await html({ type: 'mathBlock', attrs: { latex: '\\frac{1' } });
    expect(out).toContain('katex-error');
  });

  it('reports no maths when there is none', async () => {
    expect((await renderContent(doc(p(text('x'))))).hasMath).toBe(false);
  });
});

describe('renderer: code', () => {
  it('highlights an allow-listed language with a copy button', async () => {
    const out = await renderContent(
      doc({ type: 'codeBlock', attrs: { language: 'py' }, content: [text('print("hi")')] }),
    );
    expect(out.hasCode).toBe(true);
    expect(out.html).toMatch(/^<figure class="code" data-lang="python">/);
    expect(out.html).toContain('<span class="code-lang">Python</span>');
    expect(out.html).toContain('<button type="button" class="code-copy">Copy</button>');
    expect(out.html).toContain('<pre class="shiki');
    const code = new DOMParser().parseFromString(out.html, 'text/html').querySelector('pre code');
    expect(code?.textContent).toBe('print("hi")');
  });

  it('shows pseudocode and unknown languages as plain text', async () => {
    for (const language of ['pseudocode', 'cobol', undefined]) {
      const out = await html({ type: 'codeBlock', attrs: { language }, content: [text('x ← 1')] });
      expect(out).toContain('data-lang="text"');
      expect(out).toContain('x ← 1');
    }
  });
});

describe('renderer: tables', () => {
  const cell = (type: string, t: string, attrs?: unknown) => ({ type, attrs, content: [p(text(t))] });
  const row = (...cells: unknown[]) => ({ type: 'tableRow', content: cells });

  it('renders a header row as thead and keeps cells compact', async () => {
    expect(
      await html({
        type: 'table',
        content: [
          row(cell('tableHeader', 'Type'), cell('tableHeader', 'Example')),
          row(cell('tableCell', 'int'), cell('tableCell', '42')),
        ],
      }),
    ).toBe(
      '<div class="table-wrap" tabindex="0"><table>' +
        '<thead><tr><th scope="col">Type</th><th scope="col">Example</th></tr></thead>' +
        '<tbody><tr><td>int</td><td>42</td></tr></tbody></table></div>',
    );
  });

  it('renders a table without a header row and row headers', async () => {
    expect(await html({ type: 'table', content: [row(cell('tableHeader', 'Best'), cell('tableCell', 'O(1)'))] })).toBe(
      '<div class="table-wrap" tabindex="0"><table><tbody>' +
        '<tr><th scope="row">Best</th><td>O(1)</td></tr></tbody></table></div>',
    );
  });

  it('keeps valid colspan and rowspan, and paragraphs when a cell has several', async () => {
    const out = await html({
      type: 'table',
      content: [
        row(cell('tableCell', 'a', { colspan: 2, rowspan: 3 }), {
          type: 'tableCell',
          content: [p(text('x')), p(text('y'))],
        }),
      ],
    });
    expect(out).toContain('<td colspan="2" rowspan="3">a</td>');
    expect(out).toContain('<td><p>x</p><p>y</p></td>');
  });

  it('drops empty tables and rows', async () => {
    expect(await html({ type: 'table', content: [] }, { type: 'table', content: [row()] })).toBe('');
  });

  it('includes cell text in the search text', async () => {
    const out = await renderContent(doc({ type: 'table', content: [row(cell('tableCell', 'float'))] }));
    expect(out.searchText).toBe('float');
  });
});

describe('renderer: media', () => {
  it('renders an image from the media origin as a figure with caption', async () => {
    expect(
      await html({
        type: 'image',
        attrs: {
          src: 'https://files.codingspace.io/img/tri.png',
          alt: 'A triangle',
          caption: 'Figure 1',
          width: 640,
          height: 480,
        },
      }),
    ).toBe(
      '<figure class="figure"><img src="https://files.codingspace.io/img/tri.png" alt="A triangle" width="640" height="480" loading="lazy" decoding="async"><figcaption>Figure 1</figcaption></figure>',
    );
  });

  it('drops an image from any other origin', async () => {
    expect(await html({ type: 'image', attrs: { src: 'https://example.com/a.png', alt: 'a' } })).toBe('');
  });

  it('renders a file row with a readable size', async () => {
    expect(
      await html({
        type: 'file',
        attrs: { href: 'https://files.codingspace.io/f/notes.pdf', name: 'notes.pdf', size: 1_258_291 },
      }),
    ).toBe(
      '<p class="file-row"><a href="https://files.codingspace.io/f/notes.pdf" rel="noopener"><span class="file-name">notes.pdf</span> <span class="file-size">1.2 MB</span></a></p>',
    );
  });

  const ID = '3f2b8c1e-9a4d-4c6b-8e2f-1a2b3c4d5e6f';
  const variant = (w: number, f: string) => `https://files.codingspace.io/i/${ID}/${w}.${f}`;

  it('renders an uploaded image as AVIF and WebP variants with srcset (03 §7)', async () => {
    const out = await html({
      type: 'image',
      attrs: { media: ID, widths: [480, 960, 1600], width: 2400, height: 1200, alt: 'Graph', caption: 'Fig. 2' },
    });
    const sizes = 'sizes="(min-width: 1100px) 720px, 100vw"';
    expect(out).toBe(
      '<figure class="figure"><picture>' +
        `<source type="image/avif" srcset="${variant(480, 'avif')} 480w, ${variant(960, 'avif')} 960w, ${variant(1600, 'avif')} 1600w" ${sizes}>` +
        `<img src="${variant(960, 'webp')}" srcset="${variant(480, 'webp')} 480w, ${variant(960, 'webp')} 960w, ${variant(1600, 'webp')} 1600w" ${sizes}` +
        ' alt="Graph" width="2400" height="1200" loading="lazy" decoding="async"></picture>' +
        '<figcaption>Fig. 2</figcaption></figure>',
    );
  });

  it('uses the largest variant up to 960 px as the fallback src', async () => {
    const out = await html({ type: 'image', attrs: { media: ID, widths: [300], width: 300, height: 200, alt: '' } });
    expect(out).toContain(`<img src="${variant(300, 'webp')}"`);
  });

  it.each([
    ['no widths', {}],
    ['empty widths', { widths: [] }],
    ['unsorted widths', { widths: [960, 480] }],
    ['a width that is not a number', { widths: ['480"><script>'] }],
  ])('drops an uploaded image with %s', async (_, extra) => {
    expect(await html({ type: 'image', attrs: { media: ID, alt: 'a', ...extra } })).toBe('');
  });

  it('ignores a media id that is not a uuid and falls back to src', async () => {
    const out = await html({ type: 'image', attrs: { media: '../x', widths: [480], alt: 'a' } });
    expect(out).toBe('');
  });

  it('renders an uploaded file as a download from the media address', async () => {
    expect(await html({ type: 'file', attrs: { media: ID, name: 'Worksheet 1.pdf', size: 245_760 } })).toBe(
      `<p class="file-row"><a href="https://files.codingspace.io/f/${ID}" rel="noopener">` +
        '<span class="file-name">Worksheet 1.pdf</span> <span class="file-size">240 KB</span></a></p>',
    );
  });

  it.each([
    ['youtube', 'dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['desmos', 'abcde12345', 'https://www.desmos.com/calculator/abcde12345?embed'],
    ['geogebra', 'Xyz123ab', 'https://www.geogebra.org/material/iframe/id/Xyz123ab'],
  ])('builds the %s embed URL from a checked id', async (provider, id, src) => {
    const out = await html({ type: 'embed', attrs: { provider, id, title: 'Demo' } });
    expect(out).toBe(
      `<figure class="embed embed--${provider}"><iframe src="${src}" title="Demo" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" allowfullscreen></iframe></figure>`,
    );
  });
});

describe('renderer: toc, search text and reading time', () => {
  it('builds a table of contents from h2 and h3 only', async () => {
    const out = await renderContent(
      doc(
        { type: 'heading', attrs: { level: 2 }, content: [text('AM–GM')] },
        { type: 'heading', attrs: { level: 3 }, content: [text('Proof')] },
        { type: 'heading', attrs: { level: 4 }, content: [text('Detail')] },
      ),
    );
    expect(out.toc).toEqual([
      { id: 'am-gm', text: 'AM–GM', level: 2 },
      { id: 'proof', text: 'Proof', level: 3 },
    ]);
  });

  it('collects plain search text from text, captions and code', async () => {
    const out = await renderContent(
      doc(
        p(text('Hello '), text('world', { type: 'bold' })),
        { type: 'image', attrs: { src: 'https://files.codingspace.io/a.png', alt: 'graph', caption: 'A parabola' } },
        { type: 'codeBlock', attrs: { language: 'python' }, content: [text('def f(): pass')] },
      ),
    );
    expect(out.searchText).toBe('Hello world graph A parabola def f(): pass');
  });

  it('estimates reading time at 200 words a minute, at least 1 minute', async () => {
    expect((await renderContent(doc(p(text('one two'))))).readingMinutes).toBe(1);
    const words = Array.from({ length: 450 }, () => 'word').join(' ');
    expect((await renderContent(doc(p(text(words))))).readingMinutes).toBe(3);
  });
});
