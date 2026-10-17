import { fallbackWidth, fileKey, imageKey, isMediaId, mediaUrl, mediaWidths } from '@/lib/media-urls';
import { EMBED_ORIGINS } from '@/config/content-origins.mjs';

/**
 * The editor's JSON → Markdown (03 ADM-16): the readable half of an export, in the format
 * content:import reads (src/server/content/markdown.ts), so Markdown in, Markdown out.
 * Images, files and embeds become links to where they are served; the export's JSON keeps
 * them exactly. Underline has no Markdown form and is dropped.
 */

type Json = Record<string, unknown>;
const arr = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);
const attrs = (n: Json): Json => (n.attrs && typeof n.attrs === 'object' ? (n.attrs as Json) : {});
const str = (v: unknown) => (typeof v === 'string' ? v : '');

const MARKS = { bold: '**', italic: '*', strike: '~~' } as const;
type Wrap = keyof typeof MARKS | 'link';

// Characters that could start Markdown syntax inside text.
const escapeText = (s: string) => s.replace(/[\\`*_[\]<>$|~]/g, '\\$&').replace(/&(?=#?[a-zA-Z0-9]+;)/g, '\\&');
// …and at the start of a line, where they would make a heading, quote or list.
const escapeLineStart = (s: string) =>
  s.replace(/^(\s*)([#>+-])(?=\s|$)/gm, '$1\\$2').replace(/^(\s*\d+)([.)])(?=\s|$)/gm, '$1\\$2');

const fence = (text: string, char: string, min: number) => {
  const longest = Math.max(
    0,
    ...(text.match(new RegExp(`${char === '`' ? '`' : '~'}+`, 'g')) ?? []).map((r) => r.length),
  );
  return char.repeat(Math.max(min, longest + 1));
};

function codeSpan(text: string) {
  const ticks = fence(text, '`', 1);
  const pad = /^`|`$|^ .* $/.test(text) ? ' ' : '';
  return `${ticks}${pad}${text}${pad}${ticks}`;
}

/** Inline nodes, opening and closing marks across neighbours so `**a *b***` stays one bold run. */
function inline(nodes: Json[]): string {
  let out = '';
  let pending = ''; // trailing spaces, written once we know which marks close before them
  const open: { type: Wrap; href?: string }[] = [];
  const same = (a: { type: Wrap; href?: string }, b: { type: Wrap; href?: string }) =>
    a.type === b.type && a.href === b.href;
  const closeTo = (depth: number) => {
    while (open.length > depth) {
      const m = open.pop()!;
      out += m.type === 'link' ? `](${m.href})` : MARKS[m.type];
    }
  };
  const flush = () => {
    out += pending;
    pending = '';
  };

  for (const node of nodes) {
    const wanted: { type: Wrap; href?: string }[] = [];
    const marks = node.type === 'text' ? arr(node.marks) : [];
    for (const m of marks) {
      if (m.type === 'link') wanted.unshift({ type: 'link', href: str(attrs(m).href) });
      else if (m.type === 'bold' || m.type === 'italic' || m.type === 'strike') wanted.push({ type: m.type });
    }
    // Keep the open marks this node shares, from the outside in; close the rest.
    let keep = 0;
    while (keep < open.length && wanted.some((w) => same(w, open[keep]!))) keep++;
    closeTo(keep);
    flush();

    if (node.type === 'hardBreak') out += '\\\n';
    else if (node.type === 'mathInline') out += `$${str(attrs(node).latex)}$`;
    else if (node.type === 'text') {
      const isCode = marks.some((m) => m.type === 'code');
      let text = str(node.text);
      // Delimiters can't sit next to spaces inside them: move the spaces outside.
      const lead = isCode ? '' : (/^\s+/.exec(text)?.[0] ?? '');
      text = text.slice(lead.length);
      pending = isCode ? '' : (/\s+$/.exec(text)?.[0] ?? '');
      text = text.slice(0, text.length - pending.length);
      out += lead;
      for (const w of wanted.filter((w) => !open.some((o) => same(o, w)))) {
        out += w.type === 'link' ? '[' : MARKS[w.type];
        open.push(w);
      }
      out += isCode ? codeSpan(text) : escapeText(text);
    }
  }
  closeTo(0);
  flush();
  return escapeLineStart(out);
}

function mediaLink(node: Json): string {
  const a = attrs(node);
  if (node.type === 'image') {
    const widths = mediaWidths(a.widths);
    const src = isMediaId(a.media) && widths ? mediaUrl(imageKey(a.media, fallbackWidth(widths), 'webp')) : str(a.src);
    const caption = str(a.caption);
    return `![${escapeText(str(a.alt))}](<${src}>${caption ? ` "${caption.replace(/"/g, '\\"')}"` : ''})`;
  }
  if (node.type === 'file') {
    const href = isMediaId(a.media) ? mediaUrl(fileKey(a.media)) : str(a.href);
    return `[${escapeText(str(a.name) || 'File')}](<${href}>)`;
  }
  const provider = str(a.provider) as keyof typeof EMBED_ORIGINS;
  const url =
    provider === 'youtube'
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(str(a.id))}`
      : provider === 'desmos'
        ? `${EMBED_ORIGINS.desmos}/calculator/${encodeURIComponent(str(a.id))}`
        : `${EMBED_ORIGINS.geogebra}/m/${encodeURIComponent(str(a.id))}`;
  return `[${escapeText(str(a.title) || `${provider} embed`)}](<${url}>)`;
}

const indent = (text: string, first: string, rest: string) =>
  text
    .split('\n')
    .map((line, i) => (line ? (i === 0 ? first : rest) + line : line))
    .join('\n');

function tableCell(cell: Json): string {
  const blocks = arr(cell.content);
  const para = blocks.find((b) => b.type === 'paragraph');
  return para ? inline(arr(para.content)).replace(/\n/g, ' ').replace(/\\\|/g, '\\|') : '';
}

function block(node: Json): string {
  const a = attrs(node);
  switch (node.type) {
    case 'paragraph':
      return inline(arr(node.content));
    case 'heading': {
      const level = Math.min(Math.max(Number(a.level) || 2, 2), 4);
      return `${'#'.repeat(level)} ${inline(arr(node.content)).replace(/\\\n/g, ' ')}`;
    }
    case 'bulletList':
      return arr(node.content)
        .map((item) => indent(blocks(arr(item.content)), '- ', '  '))
        .join('\n');
    case 'orderedList': {
      const start = Number.isInteger(a.start) ? (a.start as number) : 1;
      return arr(node.content)
        .map((item, i) => {
          const marker = `${start + i}. `;
          return indent(blocks(arr(item.content)), marker, ' '.repeat(marker.length));
        })
        .join('\n');
    }
    case 'blockquote':
      return quote(blocks(arr(node.content)));
    case 'callout':
      return quote(`[!${str(a.variant).toUpperCase() || 'NOTE'}]\n${blocks(arr(node.content))}`);
    case 'horizontalRule':
      return '---';
    case 'codeBlock': {
      const text = arr(node.content)
        .map((t) => str(t.text))
        .join('');
      const ticks = fence(text, '`', 3);
      return `${ticks}${str(a.language)}\n${text}\n${ticks}`;
    }
    case 'mathBlock':
      return `$$\n${str(a.latex)}\n$$`;
    case 'table': {
      const rows = arr(node.content).map((r) => arr(r.content).map(tableCell));
      if (!rows.length) return '';
      const width = Math.max(...rows.map((r) => r.length));
      const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`;
      return [line(rows[0]!), `|${' --- |'.repeat(width)}`, ...rows.slice(1).map(line)].join('\n');
    }
    case 'image':
    case 'file':
    case 'embed':
      return mediaLink(node);
    default:
      return '';
  }
}

const quote = (text: string) => indent(text, '> ', '> ').replace(/^$/gm, '>');

function blocks(nodes: Json[]): string {
  return nodes
    .map(block)
    .filter((b) => b !== '')
    .join('\n\n');
}

export function docToMarkdown(doc: unknown): string {
  const body = blocks(arr((doc as Json | null)?.content));
  return body ? `${body}\n` : '';
}
