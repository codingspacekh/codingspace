// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { markdownToDoc } from '@/server/content/markdown';
import { docToMarkdown } from '@/server/export/markdown';

type Json = Record<string, unknown>;
const t = (text: string, ...marks: Json[]) => ({ type: 'text', text, ...(marks.length ? { marks } : {}) });
const p = (...content: Json[]) => ({ type: 'paragraph', content });
const doc = (...content: Json[]) => ({ type: 'doc', content });
const bold = { type: 'bold' };
const italic = { type: 'italic' };
const code = { type: 'code' };
const link = (href: string) => ({ type: 'link', attrs: { href } });

/** Export → import gives back the same document. */
function roundTrips(d: Json) {
  const md = docToMarkdown(d);
  const back = markdownToDoc(md);
  expect(back.warnings).toEqual([]);
  expect(back.doc).toEqual(d);
  return md;
}

// 03 ADM-16: Markdown out is the Markdown content:import reads.
describe('docToMarkdown', () => {
  const dir = join(process.cwd(), 'content/posts');
  const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.md'));

  it.each(files)('round-trips %s', (file) => {
    const body = readFileSync(join(dir, file), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
    const { doc: imported, warnings } = markdownToDoc(body);
    expect(warnings).toEqual([]);
    roundTrips(imported);
  });

  it('keeps marks across neighbours and moves spaces outside them', () => {
    const md = roundTrips(doc(p(t('a '), t('bold ', bold), t('both', bold, italic), t(' and '), t('x', italic))));
    expect(md).toBe('a **bold *both*** and *x*\n');
    roundTrips(
      doc(p(t('see '), t('the ', link('https://a.example')), t('docs', link('https://a.example'), bold), t('.'))),
    );
  });

  it('escapes text that would otherwise become Markdown', () => {
    roundTrips(doc(p(t('2 * 3 = 6, a_b, [x], <b>, $5, a|b, ~x~, \\ and &amp;'))));
    roundTrips(doc(p(t('# not a heading')), p(t('1. not a list')), p(t('- nor this')), p(t('> nor a quote'))));
  });

  it('writes code spans with enough backticks', () => {
    expect(roundTrips(doc(p(t('use '), t('a `b` c', code))))).toBe('use ``a `b` c``\n');
    roundTrips(doc(p(t('`x', code))));
  });

  it('writes lists, quotes, callouts, tables, maths, code and rules', () => {
    roundTrips(
      doc(
        { type: 'heading', attrs: { level: 3 }, content: [t('Steps')] },
        {
          type: 'orderedList',
          attrs: { start: 3 },
          content: [
            { type: 'listItem', content: [p(t('one'))] },
            {
              type: 'listItem',
              content: [p(t('two')), { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('inner'))] }] }],
            },
          ],
        },
        { type: 'blockquote', content: [p(t('quoted')), p(t('twice'))] },
        { type: 'callout', attrs: { variant: 'exam-tip' }, content: [p(t('Show '), t('working', bold))] },
        {
          type: 'table',
          content: [
            { type: 'tableRow', content: [th('n'), th('n²')] },
            { type: 'tableRow', content: [td('2'), td('a|b')] },
          ],
        },
        { type: 'mathBlock', attrs: { latex: '\\sum_{i=1}^n i' } },
        p(t('inline '), { type: 'mathInline', attrs: { latex: 'x^2' } }, t(' maths')),
        { type: 'codeBlock', attrs: { language: 'python' }, content: [{ type: 'text', text: 'print("```")' }] },
        { type: 'horizontalRule' },
        p(t('line'), { type: 'hardBreak' }, t('break')),
      ),
    );
  });

  it('links images, files and embeds to where they are served', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    const md = docToMarkdown(
      doc(
        { type: 'image', attrs: { media: id, widths: [480, 960], alt: 'A graph', caption: 'Figure "1"' } },
        { type: 'file', attrs: { media: id, name: 'notes.pdf', size: 10 } },
        { type: 'embed', attrs: { provider: 'youtube', id: 'dQw4w9WgXcQ', title: 'Talk' } },
      ),
    );
    expect(md).toContain(`![A graph](<https://files.codingspacekh.dev/i/${id}/960.webp> "Figure \\"1\\"")`);
    expect(md).toContain(`[notes.pdf](<https://files.codingspacekh.dev/f/${id}>)`);
    expect(md).toContain('[Talk](<https://www.youtube.com/watch?v=dQw4w9WgXcQ>)');
    // A linked image comes back as the same image.
    roundTrips(doc({ type: 'image', attrs: { src: 'https://files.codingspacekh.dev/a.png', alt: 'a', caption: 'c' } }));
  });

  it('is empty for an empty document', () => {
    expect(docToMarkdown({ type: 'doc', content: [] })).toBe('');
    expect(docToMarkdown(null)).toBe('');
  });
});

function th(text: string) {
  return { type: 'tableHeader', content: [p(t(text))] };
}
function td(text: string) {
  return { type: 'tableCell', content: [p(t(text))] };
}
