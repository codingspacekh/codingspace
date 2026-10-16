import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Editor } from '@tiptap/core';
import { normalizeDoc } from '@/lib/content-json';
import { contentExtensions } from '@/editor/nodes';
import { loadContent } from '@/server/content/load';
import { renderContent } from '@/server/render';

// The content contract (D6): whatever the import script or an earlier save produced must come
// back out of the editor unchanged. A node the editor didn't know would be dropped silently.

const FIXTURES = join(__dirname, '../../fixtures/lessons');
const docs: [string, unknown][] = [
  ...readdirSync(FIXTURES).map(
    (f) => [`fixture ${f}`, JSON.parse(readFileSync(join(FIXTURES, f), 'utf8'))] as [string, unknown],
  ),
  ...loadContent(join(__dirname, '../../../content')).posts.map(
    (p) => [`content ${p.slug}`, p.doc] as [string, unknown],
  ),
];

function roundTrip(doc: unknown) {
  const editor = new Editor({ extensions: contentExtensions(), content: doc as object, injectCSS: false });
  const out = editor.getJSON();
  editor.destroy();
  return normalizeDoc(out);
}

describe('editor round trip', () => {
  it('covers every node type of the content format', () => {
    const types = new Set<string>();
    const walk = (n: unknown) => {
      if (n && typeof n === 'object') {
        const node = n as { type?: string; marks?: { type: string }[]; content?: unknown[] };
        if (node.type) types.add(node.type);
        node.marks?.forEach((m) => types.add(`mark:${m.type}`));
        node.content?.forEach(walk);
      }
    };
    docs.forEach(([, d]) => walk(d));
    for (const t of [
      'mathBlock',
      'mathInline',
      'callout',
      'embed',
      'image',
      'file',
      'table',
      'codeBlock',
      'mark:link',
    ]) {
      expect(types).toContain(t);
    }
  });

  it.each(docs)('%s comes back unchanged', async (_name, doc) => {
    const out = roundTrip(doc);
    expect(out).toEqual(normalizeDoc(doc));
    expect((await renderContent(out)).html).toBe((await renderContent(doc)).html);
  });
});

describe('normalizeDoc', () => {
  it('keeps only the attributes the renderer reads, and drops defaults', () => {
    expect(
      normalizeDoc({
        type: 'doc',
        content: [
          { type: 'orderedList', attrs: { start: 1, type: null }, content: [] },
          { type: 'codeBlock', attrs: { language: null }, content: [{ type: 'text', text: 'x' }] },
          {
            type: 'paragraph',
            attrs: { textAlign: null },
            content: [
              {
                type: 'text',
                text: 'a',
                marks: [
                  { type: 'link', attrs: { href: 'https://x.io', target: '_blank', rel: 'noopener', class: null } },
                ],
              },
            ],
          },
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [{ type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [] }],
              },
            ],
          },
        ],
      }),
    ).toEqual({
      type: 'doc',
      content: [
        { type: 'orderedList' },
        { type: 'codeBlock', content: [{ type: 'text', text: 'x' }] },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'a', marks: [{ type: 'link', attrs: { href: 'https://x.io' } }] }],
        },
        { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell' }] }] },
      ],
    });
  });

  it('drops nodes and marks outside the format', () => {
    expect(
      normalizeDoc({
        type: 'doc',
        content: [
          { type: 'script', text: 'alert(1)' },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'x', marks: [{ type: 'highlight' }, { type: 'bold' }] }],
          },
        ],
      }),
    ).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }] }] }],
    });
  });

  it('turns anything that is not a document into an empty one', () => {
    expect(normalizeDoc(null)).toEqual({ type: 'doc', content: [] });
    expect(normalizeDoc({ type: 'paragraph' })).toEqual({ type: 'doc', content: [] });
  });
});
