import type { Editor } from '@tiptap/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import maths from '../../fixtures/lessons/maths.json';
import { PostEditor, type Doc } from '@/editor/post-editor';

// jsdom has no layout: ProseMirror asks for rectangles when it positions the cursor and the menu.
beforeAll(() => {
  const rect = () => ({ x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON: () => ({}) });
  Range.prototype.getBoundingClientRect = rect as never;
  Range.prototype.getClientRects = (() => ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: [][Symbol.iterator],
  })) as never;
  document.elementFromPoint = () => null;
});

const empty = { type: 'doc', content: [{ type: 'paragraph' }] };

async function setup(initial: unknown = empty, askValue = vi.fn<(q: string) => string | null>(() => null)) {
  let last: Doc | null = null;
  const onChange = vi.fn((d: Doc) => {
    last = d;
  });
  const onMessage = vi.fn();
  render(<PostEditor initial={initial} lang="en" onChange={onChange} onMessage={onMessage} askValue={askValue} />);
  const body = await screen.findByRole('textbox', { name: 'Body' });
  const editor = (body as HTMLElement & { editor: Editor }).editor;
  return { body, editor, onChange, onMessage, askValue, last: () => last };
}

const type = (editor: Editor, text: string) => act(() => void editor.chain().focus().insertContent(text).run());
const menuOptions = () => within(screen.getByRole('listbox')).getAllByRole('option');
const key = (body: HTMLElement, k: string) => act(() => void fireEvent.keyDown(body, { key: k }));

describe('PostEditor', () => {
  it('loads a lesson with its maths, and the maths block has a live preview', async () => {
    await setup(maths);
    const latex = screen.getAllByLabelText('Maths block (LaTeX)')[0] as HTMLTextAreaElement;
    expect(latex.value).not.toBe('');
    expect(screen.getAllByRole('img', { name: 'Preview' })[0]!.querySelector('.katex')).not.toBeNull();
  });

  it('typing LaTeX updates the preview and the saved document', async () => {
    const { last } = await setup({ type: 'doc', content: [{ type: 'mathBlock', attrs: { latex: '' } }] });
    const preview = screen.getByRole('img', { name: 'Preview' });
    expect(preview).toHaveTextContent('Type LaTeX above');
    fireEvent.change(screen.getByLabelText('Maths block (LaTeX)'), { target: { value: '\\frac{a}{b}' } });
    await waitFor(() => expect(preview.querySelector('.katex')).not.toBeNull());
    expect(last()!.content[0]).toEqual({ type: 'mathBlock', attrs: { latex: '\\frac{a}{b}' } });
  });

  it('"/" on an empty line opens the block menu; typing filters it', async () => {
    const { editor } = await setup();
    await type(editor, '/');
    const menu = await screen.findByRole('listbox', { name: 'Insert a block' });
    expect(within(menu).getAllByRole('option').length).toBeGreaterThan(10);
    await type(editor, 'mat');
    await waitFor(() =>
      expect(
        within(menu)
          .getAllByRole('option')
          .map((o) => o.querySelector('strong')!.textContent),
      ).toEqual(['Maths block', 'Inline maths']),
    );
    expect(within(menu).getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('arrow keys move through the menu and Enter inserts the block in place of "/…"', async () => {
    const { editor, body, last } = await setup();
    await type(editor, '/math');
    await screen.findByRole('listbox');
    expect(body).toHaveAttribute('aria-activedescendant', expect.stringMatching(/-0$/));
    await key(body, 'ArrowDown');
    expect(menuOptions()[1]).toHaveAttribute('aria-selected', 'true');
    expect(body).toHaveAttribute('aria-activedescendant', expect.stringMatching(/-1$/));
    await key(body, 'ArrowDown');
    expect(menuOptions()[0]).toHaveAttribute('aria-selected', 'true'); // wraps around
    await key(body, 'Enter');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(last()!.content).toEqual([{ type: 'mathBlock' }]);
  });

  it('Escape closes the menu and leaves the text', async () => {
    const { editor, body, last } = await setup();
    await type(editor, '/co');
    await screen.findByRole('listbox');
    await key(body, 'Escape');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(last()!.content).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: '/co' }] }]);
  });

  it('"/" in the middle of a sentence is just a slash', async () => {
    const { editor } = await setup();
    await type(editor, 'a/b');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('inserts an embed from a pasted link, and refuses other sites', async () => {
    const askValue = vi.fn<(q: string) => string | null>(() => 'https://youtu.be/dQw4w9WgXcQ');
    const { editor, body, last, onMessage } = await setup(empty, askValue);
    await type(editor, '/embed');
    await screen.findByRole('listbox');
    await key(body, 'Enter');
    await waitFor(() =>
      expect(last()!.content).toContainEqual({ type: 'embed', attrs: { provider: 'youtube', id: 'dQw4w9WgXcQ' } }),
    );

    askValue.mockReturnValue('https://evil.example/video');
    await type(editor, '/embed');
    await screen.findByRole('listbox');
    await key(body, 'Enter');
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith(expect.stringContaining('isn’t a YouTube video')));
  });

  it('toolbar: bold shows as pressed, and unsafe links are refused', async () => {
    const askValue = vi.fn<(q: string) => string | null>(() => 'javascript:alert(1)');
    const { editor, onMessage } = await setup(
      { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] },
      askValue,
    );
    const user = userEvent.setup();
    act(() => void editor.commands.selectAll());
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Link' }));
    expect(onMessage).toHaveBeenCalledWith(expect.stringContaining('https://'));
    expect(editor.isActive('link')).toBe(false);
  });

  it('changing the callout type and the code language is saved', async () => {
    const { last } = await setup({
      type: 'doc',
      content: [
        {
          type: 'callout',
          attrs: { variant: 'note' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }],
        },
        { type: 'codeBlock', attrs: { language: 'python' }, content: [{ type: 'text', text: 'print(1)' }] },
      ],
    });
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Callout type' }), 'exam-tip');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Code language' }), 'sql');
    await waitFor(() =>
      expect(last()!.content).toEqual([
        {
          type: 'callout',
          attrs: { variant: 'exam-tip' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }],
        },
        { type: 'codeBlock', attrs: { language: 'sql' }, content: [{ type: 'text', text: 'print(1)' }] },
      ]),
    );
  });
});
