import { mergeAttributes, Node, type Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';

/**
 * The editor's schema: exactly the nodes and marks of the content format (D6,
 * src/server/render/schema.ts), so a post loads and saves without losing anything.
 * No views here: src/editor/views.tsx adds React node views on top for the admin.
 * renderHTML is only for copy/paste inside the editor; students' HTML comes from the renderer.
 */

const attr = (name: string, fallback: unknown = null) => ({
  default: fallback,
  parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`) ?? fallback,
  renderHTML: (attrs: Record<string, unknown>) =>
    attrs[name] == null ? {} : { [`data-${name}`]: String(attrs[name]) },
});

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({ latex: attr('latex', '') }),
  parseHTML: () => [{ tag: 'span[data-math-inline]' }],
  renderHTML: ({ HTMLAttributes, node }) => [
    'span',
    mergeAttributes(HTMLAttributes, { 'data-math-inline': '' }),
    `$${node.attrs.latex}$`,
  ],
});

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  addAttributes: () => ({ latex: attr('latex', '') }),
  parseHTML: () => [{ tag: 'div[data-math-block]' }],
  renderHTML: ({ HTMLAttributes, node }) => [
    'div',
    mergeAttributes(HTMLAttributes, { 'data-math-block': '' }),
    `$$${node.attrs.latex}$$`,
  ],
});

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes: () => ({ variant: attr('variant', 'note') }),
  parseHTML: () => [{ tag: 'aside[data-callout]' }],
  renderHTML: ({ HTMLAttributes }) => ['aside', mergeAttributes(HTMLAttributes, { 'data-callout': '' }), 0],
});

export const Embed = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  addAttributes: () => ({ provider: attr('provider', ''), id: attr('id', ''), title: attr('title') }),
  parseHTML: () => [{ tag: 'div[data-embed]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-embed': '' })],
});

// Images and files are uploaded in M4; until then the editor keeps the ones a post already has.
export const Image = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  addAttributes: () => ({
    src: attr('src', ''),
    alt: attr('alt', ''),
    caption: attr('caption'),
    width: { default: null },
    height: { default: null },
  }),
  parseHTML: () => [{ tag: 'figure[data-image]' }],
  renderHTML: ({ HTMLAttributes }) => ['figure', mergeAttributes(HTMLAttributes, { 'data-image': '' })],
});

export const FileNode = Node.create({
  name: 'file',
  group: 'block',
  atom: true,
  addAttributes: () => ({ href: attr('href', ''), name: attr('name', ''), size: { default: null } }),
  parseHTML: () => [{ tag: 'div[data-file]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-file': '' })],
});

type Named = { name: string };

/**
 * The full schema. `views` replaces nodes by name with versions that have node views
 * (src/editor/views.tsx); the schema itself stays the same, which the round-trip test checks.
 */
export function contentExtensions(views: (Named & Extensions[number])[] = []): Extensions {
  const view = (name: string) => views.find((v) => v.name === name);
  const codeBlock = view('codeBlock');
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      link: { openOnClick: false, autolink: true, protocols: ['mailto'], defaultProtocol: 'https' },
      // Not in the content format.
      trailingNode: false,
      ...(codeBlock ? { codeBlock: false } : {}),
    }),
    ...(codeBlock ? [codeBlock] : []),
    TableKit.configure({ table: { resizable: false } }),
    ...[MathInline, MathBlock, Callout, Embed, Image, FileNode].map((n) => view(n.name) ?? n),
  ];
}
