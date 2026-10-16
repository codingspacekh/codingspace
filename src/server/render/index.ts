import katex from 'katex';
import { KATEX_OPTIONS, MAX_LATEX } from '@/lib/katex-options';
import { highlight, resolveLanguage } from './highlight';
import { safeEmbed, safeLinkHref, safeMediaUrl } from './policy';
import { CALLOUT_VARIANTS, type RenderResult, type TocEntry } from './schema';

export type { RenderResult, TocEntry } from './schema';

/**
 * Tiptap JSON → safe HTML (D6, 03 §6). Runs at publish time on the server.
 *
 * The input is untrusted: only allow-listed node types, marks and attributes are
 * emitted, every string is escaped, and every URL goes through ./policy. Unknown or
 * malformed nodes are dropped rather than rejected, so one bad node cannot block a publish.
 */

const MAX_DEPTH = 32;
const WORDS_PER_MINUTE = 200;

type Node = { type?: unknown; attrs?: unknown; content?: unknown; text?: unknown; marks?: unknown };

type Context = {
  toc: TocEntry[];
  ids: Set<string>;
  /** Search text, one entry per block. */
  blocks: string[];
  /** Prose only (no code), for reading time. */
  prose: string[];
  hasMath: boolean;
  hasCode: boolean;
};

const isNode = (v: unknown): v is Node => typeof v === 'object' && v !== null && !Array.isArray(v);

function attrs(node: Node): Record<string, unknown> {
  return isNode(node.attrs) ? (node.attrs as Record<string, unknown>) : {};
}

function children(node: Node): Node[] {
  return Array.isArray(node.content) ? node.content.filter(isNode) : [];
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------- inline ----------

const MARK_ORDER = ['link', 'bold', 'italic', 'underline', 'strike', 'code'] as const;
const MARK_TAGS: Record<string, string> = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  strike: 's',
  code: 'code',
};

function renderMarks(text: string, marks: unknown): string {
  const list = Array.isArray(marks) ? marks.filter(isNode) : [];
  let out = escapeHtml(text);
  // Innermost first, so the output order is stable whatever order the editor saved.
  for (const type of [...MARK_ORDER].reverse()) {
    const mark = list.find((m) => m.type === type);
    if (!mark) continue;
    if (type === 'link') {
      const href = safeLinkHref(attrs(mark).href);
      if (!href) continue;
      const rel = href.startsWith('https:') ? ' rel="noopener noreferrer"' : '';
      out = `<a href="${escapeHtml(href)}"${rel}>${out}</a>`;
    } else {
      out = `<${MARK_TAGS[type]}>${out}</${MARK_TAGS[type]}>`;
    }
  }
  return out;
}

function renderMath(latex: unknown, displayMode: boolean, ctx: Context): string {
  const source = str(latex).slice(0, MAX_LATEX);
  if (!source.trim()) return '';
  ctx.hasMath = true;
  return katex.renderToString(source, { ...KATEX_OPTIONS, displayMode });
}

/** Returns [html, plain text] for a run of inline nodes. */
function renderInline(nodes: Node[], ctx: Context): [string, string] {
  let html = '';
  let text = '';
  for (const node of nodes) {
    if (node.type === 'text' && typeof node.text === 'string') {
      html += renderMarks(node.text, node.marks);
      text += node.text;
    } else if (node.type === 'hardBreak') {
      html += '<br>';
      text += ' ';
    } else if (node.type === 'mathInline') {
      html += renderMath(attrs(node).latex, false, ctx);
    }
  }
  return [html, text];
}

// ---------- blocks ----------

export function slugify(text: string): string {
  const slug = text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'section';
}

function uniqueId(text: string, ctx: Context): string {
  const base = slugify(text);
  let id = base;
  for (let n = 2; ctx.ids.has(id); n++) id = `${base}-${n}`;
  ctx.ids.add(id);
  return id;
}

function headingLevel(level: unknown): 2 | 3 | 4 {
  if (typeof level !== 'number' || level <= 2) return 2;
  return level >= 4 ? 4 : 3;
}

function formatSize(bytes: unknown): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const dimension = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 10_000 ? v : null);

async function renderBlocks(nodes: Node[], ctx: Context, depth: number): Promise<string> {
  if (depth > MAX_DEPTH) return '';
  let out = '';
  for (const node of nodes) out += await renderBlock(node, ctx, depth);
  return out;
}

async function renderListItems(node: Node, ctx: Context, depth: number): Promise<string> {
  let out = '';
  for (const item of children(node)) {
    if (item.type !== 'listItem') continue;
    out += `<li>${await renderBlocks(children(item), ctx, depth + 1)}</li>`;
  }
  return out;
}

const span = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 1 && v <= 20 ? v : null);

async function renderCell(cell: Node, inHead: boolean, ctx: Context, depth: number): Promise<string> {
  if (cell.type !== 'tableCell' && cell.type !== 'tableHeader') return '';
  const a = attrs(cell);
  const colspan = span(a.colspan);
  const rowspan = span(a.rowspan);
  const tag = cell.type === 'tableHeader' ? 'th' : 'td';
  const scope = tag === 'th' ? ` scope="${inHead ? 'col' : 'row'}"` : '';
  const spans = (colspan ? ` colspan="${colspan}"` : '') + (rowspan ? ` rowspan="${rowspan}"` : '');

  // A cell with one paragraph renders its text directly, which keeps tables compact.
  const blocks = children(cell);
  const only = blocks.length === 1 ? blocks[0] : undefined;
  let inner: string;
  if (only?.type === 'paragraph') {
    const [html, text] = renderInline(children(only), ctx);
    ctx.blocks.push(text);
    ctx.prose.push(text);
    inner = html;
  } else {
    inner = await renderBlocks(blocks, ctx, depth + 1);
  }
  return `<${tag}${scope}${spans}>${inner}</${tag}>`;
}

async function renderBlock(node: Node, ctx: Context, depth: number): Promise<string> {
  const a = attrs(node);
  switch (node.type) {
    case 'paragraph': {
      const [html, text] = renderInline(children(node), ctx);
      if (!html) return '';
      ctx.blocks.push(text);
      ctx.prose.push(text);
      return `<p>${html}</p>`;
    }

    case 'heading': {
      const [html, text] = renderInline(children(node), ctx);
      if (!html) return '';
      const level = headingLevel(a.level);
      const id = uniqueId(text, ctx);
      if (level <= 3) ctx.toc.push({ id, text, level: level as 2 | 3 });
      ctx.blocks.push(text);
      ctx.prose.push(text);
      return `<h${level} id="${escapeHtml(id)}">${html}</h${level}>`;
    }

    case 'bulletList': {
      const items = await renderListItems(node, ctx, depth);
      return items && `<ul>${items}</ul>`;
    }

    case 'orderedList': {
      const items = await renderListItems(node, ctx, depth);
      const start = a.start;
      const startAttr =
        typeof start === 'number' && Number.isInteger(start) && start > 1 && start < 1e6 ? ` start="${start}"` : '';
      return items && `<ol${startAttr}>${items}</ol>`;
    }

    case 'blockquote': {
      const inner = await renderBlocks(children(node), ctx, depth + 1);
      return inner && `<blockquote>${inner}</blockquote>`;
    }

    case 'table': {
      const rows = children(node).filter((r) => r.type === 'tableRow' && children(r).length > 0);
      const first = rows[0];
      if (!first) return '';
      const isHeaderRow = (r: Node) => children(r).every((c) => c.type === 'tableHeader');
      const head = isHeaderRow(first) ? first : null;
      const body = head ? rows.slice(1) : rows;
      // Cells render in order, so search text and heading ids follow the document.
      const renderRow = async (r: Node, inHead: boolean) => {
        let cells = '';
        for (const c of children(r)) cells += await renderCell(c, inHead, ctx, depth);
        return `<tr>${cells}</tr>`;
      };
      let html = '';
      if (head) html += `<thead>${await renderRow(head, true)}</thead>`;
      if (body.length) {
        let rowsHtml = '';
        for (const r of body) rowsHtml += await renderRow(r, false);
        html += `<tbody>${rowsHtml}</tbody>`;
      }
      // tabindex lets keyboard users scroll a wide table on a phone.
      return `<div class="table-wrap" tabindex="0"><table>${html}</table></div>`;
    }

    case 'horizontalRule':
      return '<hr>';

    case 'mathBlock': {
      const html = renderMath(a.latex, true, ctx);
      return html && `<div class="math-block">${html}</div>`;
    }

    case 'codeBlock': {
      const code = children(node)
        .map((c) => str(c.text))
        .join('');
      const { id, label } = resolveLanguage(a.language);
      ctx.hasCode = true;
      ctx.blocks.push(code);
      return (
        `<figure class="code" data-lang="${id}">` +
        `<div class="code-head"><span class="code-lang">${escapeHtml(label)}</span>` +
        `<button type="button" class="code-copy">Copy</button></div>` +
        `${await highlight(code, id)}</figure>`
      );
    }

    case 'callout': {
      const variant =
        typeof a.variant === 'string' && Object.hasOwn(CALLOUT_VARIANTS, a.variant)
          ? (a.variant as keyof typeof CALLOUT_VARIANTS)
          : 'note';
      const inner = await renderBlocks(children(node), ctx, depth + 1);
      return (
        `<aside class="callout callout--${variant}" role="note">` +
        `<p class="callout-label">${CALLOUT_VARIANTS[variant]}</p>${inner}</aside>`
      );
    }

    case 'image': {
      const src = safeMediaUrl(a.src);
      if (!src) return '';
      const alt = str(a.alt);
      const caption = str(a.caption);
      const width = dimension(a.width);
      const height = dimension(a.height);
      ctx.blocks.push(`${alt} ${caption}`);
      return (
        `<figure class="figure"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"` +
        (width && height ? ` width="${width}" height="${height}"` : '') +
        ` loading="lazy" decoding="async">` +
        (caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : '') +
        `</figure>`
      );
    }

    case 'file': {
      const href = safeMediaUrl(a.href);
      const name = str(a.name);
      if (!href || !name) return '';
      const size = formatSize(a.size);
      ctx.blocks.push(name);
      return (
        `<p class="file-row"><a href="${escapeHtml(href)}" rel="noopener">` +
        `<span class="file-name">${escapeHtml(name)}</span>` +
        (size ? ` <span class="file-size">${size}</span>` : '') +
        `</a></p>`
      );
    }

    case 'embed': {
      const embed = safeEmbed(a.provider, a.id);
      if (!embed) return '';
      const title = str(a.title) || embed.defaultTitle;
      ctx.blocks.push(title);
      return (
        `<figure class="embed embed--${embed.provider}"><iframe src="${escapeHtml(embed.src)}"` +
        ` title="${escapeHtml(title)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"` +
        ` sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" allowfullscreen>` +
        `</iframe></figure>`
      );
    }

    default:
      return '';
  }
}

// ---------- metadata ----------

function countWords(text: string, lang: string): number {
  try {
    const segmenter = new Intl.Segmenter(lang, { granularity: 'word' });
    let n = 0;
    for (const s of segmenter.segment(text)) if (s.isWordLike) n++;
    return n;
  } catch {
    return text.split(/\s+/).filter(Boolean).length;
  }
}

export type RenderOptions = { lang?: 'en' | 'km' };

export async function renderContent(input: unknown, options: RenderOptions = {}): Promise<RenderResult> {
  const ctx: Context = { toc: [], ids: new Set(), blocks: [], prose: [], hasMath: false, hasCode: false };
  const root = isNode(input) && input.type === 'doc' ? children(input) : [];
  const html = await renderBlocks(root, ctx, 0);
  const words = countWords(ctx.prose.join(' '), options.lang ?? 'en');

  return {
    html,
    toc: ctx.toc,
    searchText: ctx.blocks.join(' ').replace(/\s+/g, ' ').trim(),
    readingMinutes: Math.max(1, Math.ceil(words / WORDS_PER_MINUTE)),
    hasMath: ctx.hasMath,
    hasCode: ctx.hasCode,
  };
}
