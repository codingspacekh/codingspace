import type { Editor } from '@tiptap/core';
import { parseEmbedUrl } from '@/lib/embed-url';
import { PRACTICE_KINDS, type PracticeKind } from '@/lib/practice';
import { CALLOUT_VARIANTS, type CalloutVariant } from '@/server/render/schema';

/** Blocks the "/" menu (and the toolbar's Insert menu) can add: 03 ADM-04. */
export type BlockItem = { id: string; label: string; keywords: string[]; hint?: string };

export const BLOCK_ITEMS: BlockItem[] = [
  { id: 'paragraph', label: 'Text', keywords: ['paragraph', 'plain'] },
  { id: 'heading2', label: 'Heading 2', keywords: ['h2', 'title', 'section'] },
  { id: 'heading3', label: 'Heading 3', keywords: ['h3', 'subheading'] },
  { id: 'heading4', label: 'Heading 4', keywords: ['h4'] },
  { id: 'bulletList', label: 'Bulleted list', keywords: ['ul', 'unordered', 'points'] },
  { id: 'orderedList', label: 'Numbered list', keywords: ['ol', 'ordered', 'steps'] },
  { id: 'blockquote', label: 'Quote', keywords: ['blockquote', 'citation'] },
  {
    id: 'mathBlock',
    label: 'Maths block',
    keywords: ['math', 'equation', 'latex', 'formula', 'display'],
    hint: 'LaTeX, on its own line',
  },
  {
    id: 'mathInline',
    label: 'Inline maths',
    keywords: ['math', 'latex', 'formula', 'inline'],
    hint: 'LaTeX inside a sentence',
  },
  { id: 'codeBlock', label: 'Code block', keywords: ['code', 'program', 'python', 'pseudocode', 'sql'] },
  ...(Object.entries(CALLOUT_VARIANTS) as [CalloutVariant, string][]).map(([variant, label]) => ({
    id: `callout:${variant}`,
    label: `Callout: ${label}`,
    keywords: ['callout', 'box', 'note', 'tip', variant],
  })),
  {
    id: 'image',
    label: 'Image',
    keywords: ['picture', 'photo', 'diagram', 'figure', 'upload', 'png', 'jpg'],
    hint: 'Upload; or paste / drop one into the text',
  },
  {
    id: 'file',
    label: 'File',
    keywords: ['attachment', 'download', 'pdf', 'worksheet', 'upload', 'document'],
    hint: 'A download: PDF, Office, ZIP, code…',
  },
  {
    id: 'library',
    label: 'From the media library',
    keywords: ['library', 'reuse', 'existing', 'uploaded', 'image', 'file', 'media'],
    hint: 'An image or file uploaded before',
  },
  {
    id: 'embed',
    label: 'Embed',
    keywords: ['youtube', 'video', 'desmos', 'geogebra', 'graph'],
    hint: 'YouTube, Desmos or GeoGebra link',
  },
  { id: 'table', label: 'Table', keywords: ['grid', 'rows', 'columns'] },
  ...(Object.entries(PRACTICE_KINDS) as [PracticeKind, string][]).map(([kind, label]) => ({
    id: `practice:${kind}`,
    label: `Practice: ${label}`,
    keywords: ['practice', 'question', 'quiz', 'exercise', 'check', kind],
    hint: 'Checked instantly on the page',
  })),
  { id: 'horizontalRule', label: 'Divider', keywords: ['hr', 'line', 'separator', 'rule'] },
];

/** Items for what was typed after "/": label matches first, then keyword matches. */
export function filterBlockItems(query: string, items = BLOCK_ITEMS): BlockItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const starts = items.filter((i) => i.label.toLowerCase().startsWith(q));
  const contains = items.filter((i) => !starts.includes(i) && i.label.toLowerCase().includes(q));
  const keyword = items.filter(
    (i) => !starts.includes(i) && !contains.includes(i) && i.keywords.some((k) => k.startsWith(q)),
  );
  return [...starts, ...contains, ...keyword];
}

/** A new practice question: two empty options to fill in, or one answer. */
export function newPractice(kind: PracticeKind) {
  return {
    kind,
    prompt: '',
    options:
      kind === 'choice'
        ? [
            { text: '', correct: true },
            { text: '', correct: false },
          ]
        : null,
    answers: kind === 'text' ? [''] : null,
    hint: null,
    explanation: null,
  };
}

/** Asks the owner for a value (an embed link…); null means cancelled. */
export type Ask = (question: string) => string | null;

/** Blocks that start with choosing a file: a new upload, or one from the media library. */
export const UPLOAD_ITEMS = { image: 'image', file: 'file', library: 'library' } as const;

/**
 * Inserts or converts to the block. Returns an error message for the owner, or null.
 * `ask` is window.prompt in the browser, a stub in tests.
 */
export function runBlockItem(editor: Editor, id: string, ask: Ask): string | null {
  const chain = editor.chain().focus();
  if (id.startsWith('practice:')) {
    const kind = id.slice('practice:'.length);
    if (!Object.hasOwn(PRACTICE_KINDS, kind)) return `Unknown block “${id}”.`;
    chain.insertContent({ type: 'practice', attrs: newPractice(kind as PracticeKind) }).run();
    return null;
  }
  if (id.startsWith('callout:')) {
    const variant = id.slice('callout:'.length);
    chain.wrapIn('callout', { variant }).run();
    return null;
  }
  switch (id) {
    case 'paragraph':
      chain.setParagraph().run();
      return null;
    case 'heading2':
    case 'heading3':
    case 'heading4':
      chain.setHeading({ level: Number(id.slice(-1)) as 2 | 3 | 4 }).run();
      return null;
    case 'bulletList':
      chain.toggleBulletList().run();
      return null;
    case 'orderedList':
      chain.toggleOrderedList().run();
      return null;
    case 'blockquote':
      chain.toggleBlockquote().run();
      return null;
    case 'codeBlock':
      chain.setCodeBlock({ language: 'python' }).run();
      return null;
    case 'mathBlock':
      chain.insertContent({ type: 'mathBlock', attrs: { latex: '' } }).run();
      return null;
    case 'mathInline':
      chain.insertContent({ type: 'mathInline', attrs: { latex: '' } }).run();
      return null;
    case 'horizontalRule':
      chain.setHorizontalRule().run();
      return null;
    case 'table':
      chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      return null;
    case 'embed': {
      const link = ask('Paste a YouTube, Desmos or GeoGebra link');
      if (link === null) return null;
      const ref = parseEmbedUrl(link);
      if (!ref) return 'That link isn’t a YouTube video, Desmos graph or GeoGebra applet.';
      chain.insertContent({ type: 'embed', attrs: ref }).run();
      return null;
    }
    default:
      return `Unknown block “${id}”.`;
  }
}
