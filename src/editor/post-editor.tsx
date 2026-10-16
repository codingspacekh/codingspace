import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { normalizeDoc } from '@/lib/content-json';
import { safeLinkHref } from '@/server/render/policy';
import { BLOCK_ITEMS, filterBlockItems, runBlockItem, type Ask, type BlockItem } from './commands';
import { contentExtensions } from './nodes';
import { viewExtensions } from './views';

export type Doc = ReturnType<typeof normalizeDoc>;

type Slash = { query: string; from: number; to: number; index: number; items: BlockItem[]; top: number; left: number };

/** "/" typed at the start of an empty paragraph opens the block menu; the rest is the query. */
function slashAt(editor: Editor): Omit<Slash, 'index' | 'items' | 'top' | 'left'> | null {
  const { selection } = editor.state;
  const { $from } = selection;
  if (!selection.empty || $from.parent.type.name !== 'paragraph') return null;
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
  const match = /^\/([\p{L}\p{N} :-]{0,24})$/u.exec(before);
  if (!match) return null;
  return { query: match[1]!, from: $from.start(), to: $from.pos };
}

const ask: Ask = (q) => (typeof window === 'undefined' ? null : window.prompt(q));

/**
 * The block editor (03 ADM-04). `onChange` gets the canonical content JSON (D6) after every edit.
 * Uploads (image, file) come in M4.
 */
export function PostEditor({
  initial,
  lang,
  onChange,
  onMessage,
  askValue = ask,
}: {
  initial: unknown;
  lang: 'en' | 'km';
  onChange: (doc: Doc) => void;
  onMessage: (text: string) => void;
  askValue?: Ask;
}) {
  const menuId = useId();
  const [slash, setSlash] = useState<Slash | null>(null);
  const slashRef = useRef<Slash | null>(null);
  const onChangeRef = useRef(onChange);
  const editorRef = useRef<Editor | null>(null);

  const updateSlash = useCallback((editor: Editor) => {
    const found = slashAt(editor);
    if (!found) return setSlash(null);
    const items = filterBlockItems(found.query);
    const coords = editor.view.coordsAtPos(found.to);
    setSlash((prev) => ({
      ...found,
      items,
      index: prev && prev.query === found.query ? Math.min(prev.index, Math.max(items.length - 1, 0)) : 0,
      top: coords.bottom + 4,
      left: coords.left,
    }));
  }, []);

  const choose = useCallback(
    (editor: Editor, item: BlockItem) => {
      const s = slashRef.current;
      if (s) editor.chain().focus().deleteRange({ from: s.from, to: s.to }).run();
      setSlash(null);
      const error = runBlockItem(editor, item.id, askValue);
      if (error) onMessage(error);
    },
    [askValue, onMessage],
  );

  const editor = useEditor({
    extensions: contentExtensions(viewExtensions()),
    content: normalizeDoc(initial),
    // Tiptap must not add a <style> element: the CSP allows only our own stylesheets.
    injectCSS: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'ed-content',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Body',
        lang,
      },
      handleKeyDown: (_view, event) => {
        const s = slashRef.current;
        if (!s) return false;
        if (event.key === 'Escape') {
          setSlash(null);
          return true;
        }
        if (!s.items.length) return false;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          const step = event.key === 'ArrowDown' ? 1 : -1;
          setSlash({ ...s, index: (s.index + step + s.items.length) % s.items.length });
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          // Runs after this handler returns; the editor instance is set by then.
          queueMicrotask(() => editorRef.current && choose(editorRef.current, s.items[s.index]!));
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      onChangeRef.current(normalizeDoc(editor.getJSON()));
      updateSlash(editor);
    },
    onSelectionUpdate: ({ editor }) => updateSlash(editor),
  });
  // The editor's callbacks are created once; they read the latest values through these refs.
  useLayoutEffect(() => {
    slashRef.current = slash;
    onChangeRef.current = onChange;
    editorRef.current = editor;
  });

  // Screen readers follow the highlighted menu item while focus stays in the text.
  useEffect(() => {
    const dom = editor?.view.dom;
    if (!dom) return;
    if (slash?.items.length) {
      dom.setAttribute('aria-controls', menuId);
      dom.setAttribute('aria-activedescendant', `${menuId}-${slash.index}`);
      dom.setAttribute('aria-expanded', 'true');
    } else {
      dom.removeAttribute('aria-controls');
      dom.removeAttribute('aria-activedescendant');
      dom.removeAttribute('aria-expanded');
    }
  }, [editor, slash, menuId]);

  if (!editor) return <p aria-live="polite">Loading the editor…</p>;

  return (
    <div className="ed">
      <Toolbar editor={editor} onMessage={onMessage} askValue={askValue} />
      <EditorContent editor={editor} />
      {slash && (
        <ul
          id={menuId}
          role="listbox"
          aria-label="Insert a block"
          className="ed-slash"
          style={{ top: slash.top, left: slash.left }}
        >
          {slash.items.length === 0 ? (
            <li className="ed-slash-empty">No matching blocks</li>
          ) : (
            slash.items.map((item, i) => (
              <li
                key={item.id}
                id={`${menuId}-${i}`}
                role="option"
                aria-selected={i === slash.index}
                // mousedown, not click: keeps the editor's selection.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(editor, item);
                }}
              >
                <strong>{item.label}</strong>
                {item.hint && <span>{item.hint}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

const STYLE_OPTIONS = [
  { value: 'paragraph', label: 'Text' },
  { value: 'heading2', label: 'Heading 2' },
  { value: 'heading3', label: 'Heading 3' },
  { value: 'heading4', label: 'Heading 4' },
];

function Toolbar({ editor, onMessage, askValue }: { editor: Editor; onMessage: (t: string) => void; askValue: Ask }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      link: e.isActive('link'),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      blockquote: e.isActive('blockquote'),
      style: e.isActive('heading', { level: 2 })
        ? 'heading2'
        : e.isActive('heading', { level: 3 })
          ? 'heading3'
          : e.isActive('heading', { level: 4 })
            ? 'heading4'
            : 'paragraph',
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const mark = (name: 'bold' | 'italic' | 'underline' | 'strike' | 'code', label: string, short: string) => (
    <button
      type="button"
      className="ed-tool"
      aria-pressed={state[name]}
      aria-label={label}
      title={label}
      onClick={() => editor.chain().focus().toggleMark(name).run()}
    >
      {short}
    </button>
  );

  function link() {
    const current = String(editor.getAttributes('link').href ?? '');
    const input = askValue('Link address (https://…, mailto:…, or /posts/…). Leave empty to remove the link.');
    if (input === null) return;
    if (input.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    const href = safeLinkHref(input.trim());
    if (!href) return onMessage('Links must start with https://, mailto: or / (a page on this site).');
    if (href !== current) editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  }

  return (
    <div role="toolbar" aria-label="Formatting" className="ed-toolbar">
      <button
        type="button"
        className="ed-tool"
        aria-label="Undo"
        title="Undo"
        disabled={!state.canUndo}
        onClick={() => editor.chain().focus().undo().run()}
      >
        ↶
      </button>
      <button
        type="button"
        className="ed-tool"
        aria-label="Redo"
        title="Redo"
        disabled={!state.canRedo}
        onClick={() => editor.chain().focus().redo().run()}
      >
        ↷
      </button>
      <select
        aria-label="Text style"
        value={state.style}
        onChange={(e) => {
          const error = runBlockItem(editor, e.target.value, askValue);
          if (error) onMessage(error);
        }}
      >
        {STYLE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {mark('bold', 'Bold', 'B')}
      {mark('italic', 'Italic', 'I')}
      {mark('underline', 'Underline', 'U')}
      {mark('strike', 'Strikethrough', 'S')}
      {mark('code', 'Inline code', '</>')}
      <button type="button" className="ed-tool" aria-pressed={state.link} aria-label="Link" title="Link" onClick={link}>
        🔗
      </button>
      <button
        type="button"
        className="ed-tool"
        aria-pressed={state.bulletList}
        aria-label="Bulleted list"
        title="Bulleted list"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        •
      </button>
      <button
        type="button"
        className="ed-tool"
        aria-pressed={state.orderedList}
        aria-label="Numbered list"
        title="Numbered list"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1.
      </button>
      <button
        type="button"
        className="ed-tool"
        aria-pressed={state.blockquote}
        aria-label="Quote"
        title="Quote"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        ❝
      </button>
      <select
        aria-label="Insert"
        value=""
        onChange={(e) => {
          const error = runBlockItem(editor, e.target.value, askValue);
          if (error) onMessage(error);
        }}
      >
        <option value="">Insert…</option>
        {BLOCK_ITEMS.filter((i) => !STYLE_OPTIONS.some((s) => s.value === i.id)).map((i) => (
          <option key={i.id} value={i.id}>
            {i.label}
          </option>
        ))}
      </select>
      <span className="ed-hint">Type “/” on an empty line for more</span>
    </div>
  );
}
