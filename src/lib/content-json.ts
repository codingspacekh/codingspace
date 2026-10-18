/**
 * The canonical form of the content format (D6; types in src/server/render/schema.ts):
 * only known nodes and marks, only the attributes the renderer reads, no default values.
 * The editor (Tiptap) adds attributes of its own (link target/rel, table colwidth, list type);
 * saves go through this so stored JSON stays small and comparable.
 */

type Json = Record<string, unknown>;

/** Node type → attributes kept, with the value that counts as "default" (dropped). */
const NODE_ATTRS: Record<string, Record<string, unknown>> = {
  doc: {},
  paragraph: {},
  text: {},
  hardBreak: {},
  heading: { level: undefined },
  bulletList: {},
  orderedList: { start: 1 },
  listItem: {},
  blockquote: {},
  horizontalRule: {},
  codeBlock: { language: null },
  mathBlock: { latex: undefined },
  mathInline: { latex: undefined },
  callout: { variant: undefined },
  // Uploads (M4) have `media` (+ `widths`); imported content may link by `src` / `href` instead.
  image: { media: undefined, widths: null, src: undefined, alt: undefined, caption: null, width: null, height: null },
  file: { media: undefined, href: undefined, name: undefined, size: null },
  embed: { provider: undefined, id: undefined, title: null },
  // v1.1: attrs are checked by the renderer (src/server/render, renderPractice).
  practice: { kind: undefined, prompt: undefined, options: null, answers: null, hint: null, explanation: null },
  table: {},
  tableRow: {},
  tableCell: { colspan: 1, rowspan: 1 },
  tableHeader: { colspan: 1, rowspan: 1 },
};
const MARK_ATTRS: Record<string, Record<string, unknown>> = {
  bold: {},
  italic: {},
  underline: {},
  strike: {},
  code: {},
  link: { href: undefined },
};

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

function pickAttrs(attrs: unknown, allowed: Record<string, unknown>): Json | undefined {
  if (!isObj(attrs)) return undefined;
  const out: Json = {};
  for (const [k, dflt] of Object.entries(allowed)) {
    const v = attrs[k];
    if (v === undefined || v === null || v === '' || v === dflt) continue;
    out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function normalizeNode(n: unknown): Json | null {
  if (!isObj(n) || typeof n.type !== 'string' || !Object.hasOwn(NODE_ATTRS, n.type)) return null;
  const out: Json = { type: n.type };
  if (n.type === 'text') {
    if (typeof n.text !== 'string' || n.text === '') return null;
    out.text = n.text;
    const marks = Array.isArray(n.marks)
      ? n.marks.flatMap((m) => {
          if (!isObj(m) || typeof m.type !== 'string' || !Object.hasOwn(MARK_ATTRS, m.type)) return [];
          const attrs = pickAttrs(m.attrs, MARK_ATTRS[m.type]!);
          return [attrs ? { type: m.type, attrs } : { type: m.type }];
        })
      : [];
    if (marks.length) out.marks = marks;
    return out;
  }
  const attrs = pickAttrs(n.attrs, NODE_ATTRS[n.type]!);
  if (attrs) out.attrs = attrs;
  if (Array.isArray(n.content)) {
    const content = n.content.map(normalizeNode).filter((c): c is Json => c !== null);
    // Tiptap leaves out an empty node's content; so do we.
    if (content.length) out.content = content;
  }
  return out;
}

export function normalizeDoc(doc: unknown): { type: 'doc'; content: Json[] } {
  if (!isObj(doc) || doc.type !== 'doc') return { type: 'doc', content: [] };
  const content = Array.isArray(doc.content) ? doc.content.map(normalizeNode).filter((c): c is Json => c !== null) : [];
  return { type: 'doc', content };
}
