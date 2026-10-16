import type * as Md from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

/**
 * Markdown → the editor's JSON (src/server/render/schema.ts), so lessons written before
 * the M3 editor exists produce exactly what the editor will. Maths: `$…$` and `$$…$$`.
 * Callouts: a blockquote starting with [!NOTE], [!CONTEST-TIP], [!EXAM-TIP] or [!WARNING].
 * Anything without an equivalent (raw HTML, inline images) is removed and reported.
 */

type Json = Record<string, unknown>;
type Mark = Json;

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

const CALLOUT = /^\[!(NOTE|CONTEST-TIP|EXAM-TIP|WARNING)\][ \t]*\n?/;

class Converter {
  warnings = new Set<string>();
  constructor(private lineOffset: number) {}

  warn(message: string, node: Md.Node) {
    const line = (node.position?.start.line ?? 0) + this.lineOffset;
    this.warnings.add(`${message} (line ${line})`);
  }

  // ---------- inline ----------

  inline(nodes: Md.PhrasingContent[], marks: Mark[] = []): Json[] {
    const out: Json[] = [];
    for (const node of nodes) {
      switch (node.type) {
        case 'text': {
          // Soft line breaks inside a paragraph are spaces, as in the editor.
          const text = node.value.replace(/\n/g, ' ');
          if (text) out.push({ type: 'text', text, ...(marks.length ? { marks } : {}) });
          break;
        }
        case 'emphasis':
          out.push(...this.inline(node.children, [...marks, { type: 'italic' }]));
          break;
        case 'strong':
          out.push(...this.inline(node.children, [...marks, { type: 'bold' }]));
          break;
        case 'delete':
          out.push(...this.inline(node.children, [...marks, { type: 'strike' }]));
          break;
        case 'inlineCode':
          out.push({ type: 'text', text: node.value, marks: [...marks, { type: 'code' }] });
          break;
        case 'link':
          out.push(...this.inline(node.children, [...marks, { type: 'link', attrs: { href: node.url } }]));
          break;
        case 'linkReference':
          out.push(...this.inline(node.children, marks));
          break;
        case 'break':
          out.push({ type: 'hardBreak' });
          break;
        case 'inlineMath':
          out.push({ type: 'mathInline', attrs: { latex: node.value } });
          break;
        case 'html':
          this.warn('raw HTML is not supported and was removed', node);
          break;
        case 'image':
        case 'imageReference':
          this.warn('images must be on their own line', node);
          break;
        default:
          break;
      }
    }
    return out;
  }

  // ---------- blocks ----------

  blocks(nodes: Md.Node[]): Json[] {
    return nodes.flatMap((n) => this.block(n as Md.RootContent));
  }

  block(node: Md.RootContent): Json[] {
    switch (node.type) {
      case 'paragraph': {
        const meaningful = node.children.filter((c) => !(c.type === 'text' && !c.value.trim()));
        const only = meaningful.length === 1 ? meaningful[0] : undefined;
        if (only?.type === 'image') {
          return [
            {
              type: 'image',
              attrs: { src: only.url, alt: only.alt ?? '', ...(only.title ? { caption: only.title } : {}) },
            },
          ];
        }
        const content = this.inline(node.children);
        return content.length ? [{ type: 'paragraph', content }] : [];
      }

      case 'heading': {
        const level = Math.min(Math.max(node.depth, 2), 4);
        return [{ type: 'heading', attrs: { level }, content: this.inline(node.children) }];
      }

      case 'code':
        return [
          {
            type: 'codeBlock',
            attrs: { language: node.lang ?? null },
            ...(node.value ? { content: [{ type: 'text', text: node.value }] } : {}),
          },
        ];

      case 'math':
        return [{ type: 'mathBlock', attrs: { latex: node.value.trim() } }];

      case 'list':
        return [
          {
            type: node.ordered ? 'orderedList' : 'bulletList',
            ...(node.ordered ? { attrs: { start: node.start ?? 1 } } : {}),
            content: node.children.map((item) => ({ type: 'listItem', content: this.blocks(item.children) })),
          },
        ];

      case 'blockquote':
        return [this.blockquote(node)];

      case 'thematicBreak':
        return [{ type: 'horizontalRule' }];

      case 'table':
        return [
          {
            type: 'table',
            content: node.children.map((row, i) => ({
              type: 'tableRow',
              content: row.children.map((cell) => ({
                type: i === 0 ? 'tableHeader' : 'tableCell',
                content: [{ type: 'paragraph', content: this.inline(cell.children) }],
              })),
            })),
          },
        ];

      case 'html':
        this.warn('raw HTML is not supported and was removed', node);
        return [];

      default:
        return [];
    }
  }

  blockquote(node: Md.Blockquote): Json {
    const first = node.children[0];
    const firstText = first?.type === 'paragraph' ? first.children[0] : undefined;
    const match = firstText?.type === 'text' ? CALLOUT.exec(firstText.value) : null;
    if (!match || !first || first.type !== 'paragraph' || firstText?.type !== 'text') {
      return { type: 'blockquote', content: this.blocks(node.children) };
    }
    // Strip the [!MARKER] and render the rest as the callout body.
    const rest: Md.Paragraph = {
      ...first,
      children: [{ ...firstText, value: firstText.value.slice(match[0].length) }, ...first.children.slice(1)],
    };
    return {
      type: 'callout',
      attrs: { variant: match[1]!.toLowerCase() },
      content: this.blocks([rest, ...node.children.slice(1)]),
    };
  }
}

export type MarkdownResult = { doc: { type: 'doc'; content: Json[] }; warnings: string[] };

/** @param lineOffset lines before the Markdown body (front matter), so warnings point at the file line. */
export function markdownToDoc(markdown: string, { lineOffset = 0 } = {}): MarkdownResult {
  const converter = new Converter(lineOffset);
  const tree = parser.parse(markdown);
  const content = converter.blocks(tree.children);
  return { doc: { type: 'doc', content }, warnings: [...converter.warnings] };
}
