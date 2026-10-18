import { renderSnippet, renderVisitorText } from '@/server/render/snippet';

// v1.1: a visitor's question or comment is Markdown with $maths$, but only words, lists, quotes,
// code and maths; its links are marked as user content. Lessons and the teacher's answers keep
// everything (renderSnippet).

describe('visitor text', () => {
  it('keeps words, lists, quotes, code and maths', async () => {
    const { html, hasMath } = await renderVisitorText(
      'Why is **this** true?\n\n- one\n- two\n\n> a quote\n\n```py\nprint(1)\n```\n\n$x^2 \\ge 0$',
    );
    expect(html).toContain('<strong>this</strong>');
    expect(html).toContain('<ul><li><p>one</p></li><li><p>two</p></li></ul>');
    expect(html).toContain('<blockquote><p>a quote</p></blockquote>');
    expect(html).toContain('<pre');
    expect(html).toContain('class="katex"');
    expect(hasMath).toBe(true);
  });

  it('turns headings into bold paragraphs, so they never join the lesson’s outline or take its ids', async () => {
    const { html } = await renderVisitorText('# Introduction\n\nhello');
    expect(html).toBe('<p><strong>Introduction</strong></p><p>hello</p>');
    expect(html).not.toMatch(/<h\d|id="/);
  });

  it('leaves out tables, callouts and images', async () => {
    const { html } = await renderVisitorText(
      '| a | b |\n|---|---|\n| 1 | 2 |\n\n> [!NOTE]\n> look\n\n![x](https://files.codingspacekh.dev/a.png)\n\nend',
    );
    expect(html).toBe('<p>end</p>');
  });

  it('marks links as user content', async () => {
    const { html } = await renderVisitorText(
      'see [this](https://example.com/x) or [mail](mailto:a@b.c) or [here](/posts/x)',
    );
    expect(html).toContain('<a href="https://example.com/x" rel="nofollow ugc noopener noreferrer">this</a>');
    expect(html).toContain('<a href="mailto:a@b.c" rel="nofollow ugc noopener noreferrer">mail</a>');
    expect(html).toContain('<a href="/posts/x">here</a>');
  });

  it('is nothing for empty text', async () => {
    expect(await renderVisitorText('  ')).toEqual({ html: '', hasMath: false });
  });

  it('leaves the teacher’s text as it was', async () => {
    const { html } = await renderSnippet('# Title\n\n[x](https://example.com)');
    expect(html).toContain('<h2 id="title">Title</h2>');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain('nofollow');
  });
});
