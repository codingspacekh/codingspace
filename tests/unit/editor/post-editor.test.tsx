import type { Editor } from '@tiptap/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import maths from '../../fixtures/lessons/maths.json';
import { PostEditor, type Doc, type Upload } from '@/editor/post-editor';
import type { UploadedMedia } from '@/lib/media-upload';

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

async function setup(
  initial: unknown = empty,
  askValue = vi.fn<(q: string) => string | null>(() => null),
  upload = vi.fn<Upload>(),
) {
  let last: Doc | null = null;
  const onChange = vi.fn((d: Doc) => {
    last = d;
  });
  const onMessage = vi.fn();
  render(
    <PostEditor
      initial={initial}
      lang="en"
      onChange={onChange}
      onMessage={onMessage}
      askValue={askValue}
      upload={upload}
    />,
  );
  const body = await screen.findByRole('textbox', { name: 'Body' });
  const editor = (body as HTMLElement & { editor: Editor }).editor;
  return { body, editor, onChange, onMessage, askValue, upload, last: () => last };
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

  describe('uploads (03 ADM-10)', () => {
    const ID = '3f2b8c1e-9a4d-4c6b-8e2f-1a2b3c4d5e6f';
    const image: UploadedMedia = {
      id: ID,
      kind: 'image',
      mime: 'image/png',
      bytes: 2048,
      width: 1200,
      height: 600,
      widths: [480, 960, 1200],
      alt: '',
      original_name: 'graph.png',
    };
    const pdf: UploadedMedia = {
      ...image,
      kind: 'file',
      mime: 'application/pdf',
      width: null,
      height: null,
      widths: [],
    };
    const png = () => new File([new Uint8Array([0x89, 0x50])], 'graph.png', { type: 'image/png' });

    it('Insert → Image opens the picker, uploads, and inserts the image with alt and caption fields', async () => {
      const upload = vi.fn<Upload>(async () => image);
      const { last } = await setup(empty, undefined, upload);
      const user = userEvent.setup();
      await user.selectOptions(screen.getByRole('combobox', { name: 'Insert' }), 'image');
      await user.upload(screen.getByLabelText('Upload an image'), png());
      expect(upload).toHaveBeenCalledWith(expect.objectContaining({ name: 'graph.png' }), 'image');
      const alt = await screen.findByLabelText(/^Alt text/);
      // The editor shows the smallest variant from the media address.
      expect(document.querySelector('img.ed-image')).toHaveAttribute(
        'src',
        `https://files.codingspace.io/i/${ID}/480.webp`,
      );
      fireEvent.change(alt, { target: { value: 'A sine curve' } });
      fireEvent.change(screen.getByLabelText(/^Caption/), { target: { value: 'One period' } });
      await waitFor(() =>
        expect(last()!.content).toContainEqual({
          type: 'image',
          attrs: {
            media: ID,
            widths: [480, 960, 1200],
            width: 1200,
            height: 600,
            alt: 'A sine curve',
            caption: 'One period',
          },
        }),
      );
    });

    it('a pasted image (a screenshot) is uploaded and inserted', async () => {
      const upload = vi.fn<Upload>(async () => image);
      const { body, last } = await setup(empty, undefined, upload);
      fireEvent.paste(body, {
        clipboardData: { files: [png()], types: ['Files'], getData: () => '' },
      });
      await waitFor(() => expect(last()?.content.some((n) => n.type === 'image')).toBe(true));
      expect(upload).toHaveBeenCalledWith(expect.objectContaining({ name: 'graph.png' }), 'image');
    });

    it('Insert → File uploads a download block whose link text can be edited', async () => {
      const upload = vi.fn<Upload>(async () => ({ ...pdf, original_name: 'worksheet.pdf' }));
      const { last } = await setup(empty, undefined, upload);
      const user = userEvent.setup();
      await user.selectOptions(screen.getByRole('combobox', { name: 'Insert' }), 'file');
      await user.upload(screen.getByLabelText('Upload a file'), new File(['%PDF-'], 'worksheet.pdf'));
      const text = await screen.findByLabelText('Link text');
      expect(screen.getByText(/File download · 2 KB/)).toBeInTheDocument();
      fireEvent.change(text, { target: { value: 'Worksheet 1 (PDF)' } });
      await waitFor(() =>
        expect(last()!.content).toContainEqual({
          type: 'file',
          attrs: { media: ID, name: 'Worksheet 1 (PDF)', size: 2048 },
        }),
      );
    });

    it('a second upload goes after the first, even while the first is selected', async () => {
      const upload = vi.fn<Upload>(async (f) => (f.name.endsWith('.pdf') ? { ...pdf, original_name: 'w.pdf' } : image));
      const { body, editor, last } = await setup(empty, undefined, upload);
      fireEvent.paste(body, { clipboardData: { files: [png()], types: ['Files'], getData: () => '' } });
      await screen.findByLabelText(/^Alt text/);
      expect(editor.state.selection.constructor.name).toBe('NodeSelection');
      const user = userEvent.setup();
      await user.selectOptions(screen.getByRole('combobox', { name: 'Insert' }), 'file');
      await user.upload(screen.getByLabelText('Upload a file'), new File(['%PDF-'], 'w.pdf'));
      await waitFor(() => expect(last()!.content.map((n) => n.type)).toEqual(['image', 'file']));
    });

    it('shows why an upload failed until dismissed, and inserts nothing', async () => {
      const upload = vi.fn<Upload>(async () => {
        throw new Error('SVG images can contain scripts.');
      });
      const { body, last } = await setup(empty, undefined, upload);
      fireEvent.paste(body, {
        clipboardData: { files: [new File(['<svg/>'], 'logo.svg')], types: ['Files'], getData: () => '' },
      });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Couldn’t upload “logo.svg”: SVG images can contain scripts.',
      );
      expect(last()?.content.some((n) => n.type === 'image') ?? false).toBe(false);
      await userEvent.setup().click(screen.getByRole('button', { name: 'Dismiss' }));
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('says when the same file was uploaded before', async () => {
      const upload = vi.fn<Upload>(async () => ({ ...image, duplicate: true }));
      const { body, onMessage } = await setup(empty, undefined, upload);
      fireEvent.paste(body, { clipboardData: { files: [png()], types: ['Files'], getData: () => '' } });
      await waitFor(() => expect(onMessage).toHaveBeenCalledWith(expect.stringMatching(/uploaded before/)));
    });

    it('pasting text is not an upload', async () => {
      const upload = vi.fn<Upload>();
      const { body } = await setup(empty, undefined, upload);
      fireEvent.paste(body, {
        clipboardData: {
          files: [],
          types: ['text/plain'],
          getData: (t: string) => (t === 'text/plain' ? 'hello' : ''),
        },
      });
      expect(upload).not.toHaveBeenCalled();
    });
  });
});
