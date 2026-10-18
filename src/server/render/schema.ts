/**
 * The content contract (D6): the JSON the editor saves and the import script produces.
 * The renderer treats stored JSON as untrusted and checks every field at runtime,
 * so these types describe what is rendered, not what is trusted.
 */

import type { PracticeAttrs } from '@/lib/practice';

export type MarkType = 'bold' | 'italic' | 'underline' | 'strike' | 'code';

export type Mark = { type: MarkType } | { type: 'link'; attrs: { href: string } };

export type InlineNode =
  | { type: 'text'; text: string; marks?: Mark[] }
  | { type: 'hardBreak' }
  | { type: 'mathInline'; attrs: { latex: string } };

export const CALLOUT_VARIANTS = {
  note: 'Note',
  'contest-tip': 'Contest tip',
  'exam-tip': 'Exam tip',
  warning: 'Warning',
} as const;

export type CalloutVariant = keyof typeof CALLOUT_VARIANTS;

export type EmbedProvider = 'youtube' | 'desmos' | 'geogebra';

export type BlockNode =
  | { type: 'paragraph'; content?: InlineNode[] }
  | { type: 'heading'; attrs: { level: 2 | 3 | 4 }; content?: InlineNode[] }
  | { type: 'bulletList'; content: ListItemNode[] }
  | { type: 'orderedList'; attrs?: { start?: number }; content: ListItemNode[] }
  | { type: 'blockquote'; content: BlockNode[] }
  | { type: 'horizontalRule' }
  | { type: 'codeBlock'; attrs?: { language?: string }; content?: { type: 'text'; text: string }[] }
  | { type: 'mathBlock'; attrs: { latex: string } }
  | { type: 'callout'; attrs: { variant: CalloutVariant }; content: BlockNode[] }
  | {
      type: 'image';
      attrs: { src: string; alt: string; caption?: string; width?: number; height?: number };
    }
  | { type: 'file'; attrs: { href: string; name: string; size?: number } }
  | { type: 'embed'; attrs: { provider: EmbedProvider; id: string; title?: string } }
  | { type: 'table'; content: TableRowNode[] }
  | { type: 'practice'; attrs: PracticeAttrs };

/** A first row made only of header cells becomes the table's header. */
export type TableRowNode = { type: 'tableRow'; content: TableCellNode[] };

export type TableCellNode = {
  type: 'tableCell' | 'tableHeader';
  attrs?: { colspan?: number; rowspan?: number };
  content: BlockNode[];
};

export type ListItemNode = { type: 'listItem'; content: BlockNode[] };

export type DocNode = { type: 'doc'; content: BlockNode[] };

export type TocEntry = { id: string; text: string; level: 2 | 3 };

export type RenderResult = {
  html: string;
  toc: TocEntry[];
  /** Plain text for the full-text index (posts.live_search). */
  searchText: string;
  readingMinutes: number;
  /** The page loads KaTeX CSS only when this is true (03 §7, item 6). */
  hasMath: boolean;
  hasCode: boolean;
};
