import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import katex from 'katex';
import { useCallback, useId, useMemo } from 'react';
import CodeBlock from '@tiptap/extension-code-block';
import { CODE_LANGUAGE_CHOICES } from '@/lib/code-languages';
import { KATEX_OPTIONS, MAX_LATEX } from '@/lib/katex-options';
import { CALLOUT_VARIANTS } from '@/server/render/schema';
import { Callout, Embed, FileNode, Image, MathBlock, MathInline } from './nodes';

/** KaTeX exactly as the renderer calls it (src/lib/katex-options.ts). */
export function MathPreview({ latex, display }: { latex: string; display: boolean }) {
  const html = useMemo(
    () =>
      latex.trim() ? katex.renderToString(latex.slice(0, MAX_LATEX), { ...KATEX_OPTIONS, displayMode: display }) : '',
    [latex, display],
  );
  if (!html) return <span className="ed-math-empty">{display ? 'Type LaTeX above to see it here' : 'maths'}</span>;
  // KaTeX escapes its input and trust is off: no links, no raw HTML.
  return <span className="ed-math-out" dangerouslySetInnerHTML={{ __html: html }} />;
}

function MathBlockView({ node, updateAttributes, selected }: ReactNodeViewProps) {
  const id = useId();
  const latex = String(node.attrs.latex ?? '');
  return (
    <NodeViewWrapper className={`ed-block ed-math${selected ? ' is-selected' : ''}`} contentEditable={false}>
      <label htmlFor={id} className="ed-label">
        Maths block (LaTeX)
      </label>
      <textarea
        id={id}
        className="ed-latex"
        value={latex}
        rows={Math.min(8, Math.max(2, latex.split('\n').length))}
        spellCheck={false}
        placeholder="\sum_{k=1}^{n} k = \frac{n(n+1)}{2}"
        onChange={(e) => updateAttributes({ latex: e.target.value })}
      />
      <div className="ed-math-preview" aria-label="Preview" role="img">
        <MathPreview latex={latex} display />
      </div>
    </NodeViewWrapper>
  );
}

function MathInlineView({ node, updateAttributes, selected }: ReactNodeViewProps) {
  const latex = String(node.attrs.latex ?? '');
  // A new inline formula starts empty: put the cursor straight in it.
  const focusWhenNew = useCallback(
    (input: HTMLInputElement | null) => {
      if (input && !latex) input.focus();
    },
    // Only when the field first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return (
    <NodeViewWrapper as="span" className={`ed-math-inline${selected ? ' is-selected' : ''}`}>
      {selected || !latex ? (
        <input
          className="ed-latex-inline"
          aria-label="Inline maths (LaTeX)"
          value={latex}
          size={Math.max(4, latex.length + 1)}
          spellCheck={false}
          placeholder="x^2"
          ref={focusWhenNew}
          onChange={(e) => updateAttributes({ latex: e.target.value })}
        />
      ) : null}
      <MathPreview latex={latex} display={false} />
    </NodeViewWrapper>
  );
}

function CalloutView({ node, updateAttributes }: ReactNodeViewProps) {
  const id = useId();
  const variant = String(node.attrs.variant);
  return (
    <NodeViewWrapper className={`ed-block ed-callout ed-callout--${variant}`}>
      <div contentEditable={false} className="ed-callout-head">
        <label htmlFor={id} className="sr-only">
          Callout type
        </label>
        <select id={id} value={variant} onChange={(e) => updateAttributes({ variant: e.target.value })}>
          {Object.entries(CALLOUT_VARIANTS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <NodeViewContent className="ed-callout-body" />
    </NodeViewWrapper>
  );
}

function CodeBlockView({ node, updateAttributes }: ReactNodeViewProps) {
  const id = useId();
  const language = String(node.attrs.language ?? '');
  const known = CODE_LANGUAGE_CHOICES.some((c) => c.value === language);
  return (
    <NodeViewWrapper className="ed-block ed-code">
      <div contentEditable={false} className="ed-code-head">
        <label htmlFor={id} className="sr-only">
          Code language
        </label>
        <select
          id={id}
          value={known ? language : ''}
          onChange={(e) => updateAttributes({ language: e.target.value || null })}
        >
          <option value="">Plain text</option>
          {CODE_LANGUAGE_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <pre>
        <NodeViewContent<'code'> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}

const EMBED_NAMES: Record<string, string> = {
  youtube: 'YouTube video',
  desmos: 'Desmos graph',
  geogebra: 'GeoGebra applet',
};

function EmbedView({ node, updateAttributes, selected }: ReactNodeViewProps) {
  const id = useId();
  const { provider, id: embedId, title } = node.attrs as { provider: string; id: string; title: string | null };
  return (
    <NodeViewWrapper className={`ed-block ed-card${selected ? ' is-selected' : ''}`} contentEditable={false}>
      <span className="ed-label">
        {EMBED_NAMES[provider] ?? 'Embed'} · <code>{embedId}</code>
      </span>
      <label htmlFor={id} className="ed-label">
        Title (read by screen readers)
      </label>
      <input
        id={id}
        value={title ?? ''}
        placeholder={EMBED_NAMES[provider]}
        onChange={(e) => updateAttributes({ title: e.target.value || null })}
      />
    </NodeViewWrapper>
  );
}

function ImageView({ node, updateAttributes, selected }: ReactNodeViewProps) {
  const id = useId();
  const { src, alt, caption } = node.attrs as { src: string; alt: string; caption: string | null };
  return (
    <NodeViewWrapper className={`ed-block ed-card${selected ? ' is-selected' : ''}`} contentEditable={false}>
      {/* Only images on the files domain load (CSP img-src); uploads arrive in M4. */}
      <img src={src} alt="" className="ed-image" />
      <label htmlFor={`${id}-alt`} className="ed-label">
        Alt text
      </label>
      <input id={`${id}-alt`} value={alt} onChange={(e) => updateAttributes({ alt: e.target.value })} />
      <label htmlFor={`${id}-cap`} className="ed-label">
        Caption
      </label>
      <input
        id={`${id}-cap`}
        value={caption ?? ''}
        onChange={(e) => updateAttributes({ caption: e.target.value || null })}
      />
    </NodeViewWrapper>
  );
}

function FileView({ node, selected }: ReactNodeViewProps) {
  const { name } = node.attrs as { name: string };
  return (
    <NodeViewWrapper className={`ed-block ed-card${selected ? ' is-selected' : ''}`} contentEditable={false}>
      <span className="ed-label">File</span> {name}
    </NodeViewWrapper>
  );
}

/** The schema from ./nodes with the admin's React views. */
export const viewExtensions = () => [
  MathBlock.extend({ addNodeView: () => ReactNodeViewRenderer(MathBlockView) }),
  MathInline.extend({ addNodeView: () => ReactNodeViewRenderer(MathInlineView) }),
  Callout.extend({ addNodeView: () => ReactNodeViewRenderer(CalloutView) }),
  CodeBlock.extend({ addNodeView: () => ReactNodeViewRenderer(CodeBlockView) }),
  Embed.extend({ addNodeView: () => ReactNodeViewRenderer(EmbedView) }),
  Image.extend({ addNodeView: () => ReactNodeViewRenderer(ImageView) }),
  FileNode.extend({ addNodeView: () => ReactNodeViewRenderer(FileView) }),
];
