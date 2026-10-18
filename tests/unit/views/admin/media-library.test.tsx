import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MediaLibrary, MediaPicker } from '@/views/admin/media-library';

const IMG = '3f2b8c1e-9a4d-4c6b-8e2f-1a2b3c4d5e6f';
const PDF = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const FOLDER = '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const items = [
  {
    id: IMG,
    kind: 'image',
    mime: 'image/png',
    bytes: 20480,
    width: 1200,
    height: 600,
    widths: [480, 960, 1200],
    alt: 'A graph',
    original_name: 'graph.png',
    created_at: '2026-10-16T10:00:00Z',
    use_count: 2,
    folder_id: null as string | null,
  },
  {
    id: PDF,
    kind: 'file',
    mime: 'application/pdf',
    bytes: 245760,
    width: null,
    height: null,
    widths: [],
    alt: '',
    original_name: 'worksheet.pdf',
    created_at: '2026-10-15T10:00:00Z',
    use_count: 0,
    folder_id: FOLDER as string | null,
  },
];
const FOLDERS = { folders: [{ id: FOLDER, name: 'Worksheets', file_count: 1 }], all: 2, unsorted: 1 };
const details: Record<string, unknown> = {
  [IMG]: {
    ...items[0],
    used_by: [{ id: 'p1', title: 'AM–GM', slug: 'am-gm', in_draft: true, in_live: true }],
  },
  [PDF]: { ...items[1], used_by: [] },
};

type Call = { url: string; method: string; body: unknown };
function mockApi(reply?: (c: Call) => [number, unknown] | undefined) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined };
      calls.push(call);
      const custom = reply?.(call);
      if (custom) return new Response(JSON.stringify(custom[1]), { status: custom[0] });
      if (call.method === 'GET' && url === '/api/admin/media/folders') {
        return new Response(JSON.stringify(FOLDERS), { status: 200 });
      }
      if (call.method === 'GET' && url.startsWith('/api/admin/media?')) {
        const q = new URLSearchParams(url.split('?')[1]);
        const list = items.filter(
          (m) =>
            (!q.get('folder') || (m.folder_id ?? 'none') === q.get('folder')) &&
            (!q.get('kind') || m.kind === q.get('kind')) &&
            (!q.get('unused') || m.use_count === 0) &&
            (!q.get('q') || m.original_name.includes(q.get('q')!)),
        );
        return new Response(JSON.stringify({ items: list, more: false }), { status: 200 });
      }
      const id = url.split('/').pop()!;
      return new Response(JSON.stringify(details[id] ?? { ok: true }), { status: 200 });
    }),
  );
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe('media library (03 ADM-10)', () => {
  it('lists images with thumbnails and files with their type, size and use', async () => {
    mockApi();
    render(<MediaLibrary />);
    const list = await screen.findByRole('list', { name: 'Media' });
    const [image, file] = within(list).getAllByRole('button');
    expect(image).toHaveTextContent('graph.png');
    expect(image).toHaveTextContent('1200×600 · 20 KB · used in 2');
    expect(image!.querySelector('img')).toHaveAttribute('src', `https://files.codingspacekh.dev/i/${IMG}/480.webp`);
    expect(file).toHaveTextContent('PDF');
    expect(file).toHaveTextContent('240 KB · unused');
  });

  it('filters by type, unused and name through the API', async () => {
    const calls = mockApi();
    render(<MediaLibrary />);
    await screen.findByRole('list', { name: 'Media' });
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Type' }), 'file');
    await user.click(screen.getByRole('checkbox', { name: 'Unused only' }));
    await user.type(screen.getByRole('searchbox', { name: 'Name' }), 'work');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(calls.at(-1)!.url).toBe('/api/admin/media?kind=file&q=work&unused=1'));
    expect(within(screen.getByRole('list', { name: 'Media' })).getAllByRole('button')).toHaveLength(1);
  });

  it('a used file shows where it is used and cannot be deleted', async () => {
    mockApi();
    render(<MediaLibrary />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /graph\.png/ }));
    const detail = await screen.findByRole('region', { name: 'Details of graph.png' });
    expect(within(detail).getByRole('link', { name: 'AM–GM' })).toHaveAttribute('href', '/admin/posts/p1');
    expect(detail).toHaveTextContent('live and draft');
    expect(within(detail).queryByRole('button', { name: /Delete/ })).toBeNull();
    expect(detail).toHaveTextContent('remove it from these posts first');
  });

  it('the author photo counts as a use, and blocks deleting', async () => {
    mockApi((c) =>
      c.method === 'GET' && c.url === `/api/admin/media/${PDF}`
        ? [200, { ...items[1], kind: 'image', widths: [480], width: 10, height: 10, used_by: [], author_photo: true }]
        : undefined,
    );
    render(<MediaLibrary />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /worksheet\.pdf/ }));
    const detail = await screen.findByRole('region', { name: 'Details of worksheet.pdf' });
    expect(within(detail).getByRole('link', { name: 'Author page' })).toHaveAttribute('href', '/admin/author');
    expect(within(detail).queryByRole('button', { name: /Delete/ })).toBeNull();
    expect(detail).toHaveTextContent('remove it from the Author page first');
  });

  it('renames and sets the default alt text', async () => {
    const calls = mockApi();
    render(<MediaLibrary />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /graph\.png/ }));
    const detail = await screen.findByRole('region', { name: 'Details of graph.png' });
    const alt = within(detail).getByRole('textbox', { name: /Default alt text/ });
    await user.clear(alt);
    await user.type(alt, 'Sine curve');
    await user.click(within(detail).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')).toEqual({
        url: `/api/admin/media/${IMG}`,
        method: 'PATCH',
        body: { original_name: 'graph.png', alt: 'Sine curve' },
      }),
    );
    expect(await within(detail).findByRole('status')).toHaveTextContent('Saved.');
  });

  it('deletes an unused file after confirming', async () => {
    const calls = mockApi();
    render(<MediaLibrary />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /worksheet\.pdf/ }));
    const detail = await screen.findByRole('region', { name: 'Details of worksheet.pdf' });
    expect(detail).toHaveTextContent(`https://files.codingspacekh.dev/f/${PDF}`);
    expect(within(detail).queryByRole('textbox', { name: /alt/ })).toBeNull();
    await user.click(within(detail).getByRole('button', { name: 'Delete…' }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith(PDF))).toBe(true));
    expect(await screen.findByText('Deleted “worksheet.pdf”.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /worksheet\.pdf/ })).toBeNull();
  });

  it('says why a delete was refused', async () => {
    mockApi((c) => (c.method === 'DELETE' ? [409, { error: 'this file is used by AM–GM' }] : undefined));
    render(<MediaLibrary />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /worksheet\.pdf/ }));
    await user.click(await screen.findByRole('button', { name: 'Delete…' }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect(await screen.findByText('Not deleted: this file is used by AM–GM.')).toBeInTheDocument();
  });

  it('uploads from the library page', async () => {
    mockApi();
    const upload = vi.fn(async () => ({ ...items[1]!, kind: 'file' as const, original_name: 'new.pdf' }));
    render(<MediaLibrary upload={upload} />);
    await screen.findByRole('list', { name: 'Media' });
    await userEvent.setup().upload(screen.getByLabelText('Upload files'), new File(['%PDF-'], 'new.pdf'));
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ name: 'new.pdf' }), 'file');
    expect(await screen.findByText('Uploaded “new.pdf”.')).toBeInTheDocument();
  });

  it('shows an error when the list cannot load', async () => {
    mockApi(() => [500, { error: 'server_error' }]);
    render(<MediaLibrary />);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
  });
});

describe('media folders and views (v1.1)', () => {
  beforeEach(() => localStorage.clear());

  it('shows each folder with its count, opens one, and creates, renames and deletes folders', async () => {
    const calls = mockApi((c) =>
      c.method === 'POST' && c.url === '/api/admin/media/folders'
        ? [201, { id: 'f-new' }]
        : c.method === 'DELETE' && c.url.endsWith(FOLDER)
          ? [200, { moved: 1 }]
          : undefined,
    );
    const user = userEvent.setup();
    render(<MediaLibrary />);
    const bar = await screen.findByRole('navigation', { name: 'Folders' });
    expect(await within(bar).findByRole('button', { name: 'All media (2)' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(bar).getByRole('button', { name: 'Unsorted (1)' })).toBeInTheDocument();

    await user.click(within(bar).getByRole('button', { name: 'Worksheets (1)' }));
    await waitFor(() => expect(calls.at(-1)!.url).toBe(`/api/admin/media?folder=${FOLDER}`));
    expect(screen.getByRole('heading', { name: 'Worksheets' })).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Media' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1));

    await user.click(screen.getByRole('button', { name: 'Rename…' }));
    const name = screen.getByRole('textbox', { name: 'Folder name' });
    await user.clear(name);
    await user.type(name, 'Papers');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    await waitFor(() =>
      expect(calls).toContainEqual({
        url: `/api/admin/media/folders/${FOLDER}`,
        method: 'PATCH',
        body: { name: 'Papers' },
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Delete folder…' }));
    expect(screen.getByRole('group', { name: 'Confirm delete' })).toHaveTextContent(
      'Delete the folder “Worksheets”? Its 1 file move to Unsorted.',
    );
    await user.click(screen.getByRole('button', { name: 'Delete folder' }));
    expect(
      await screen.findByText('Deleted the folder “Worksheets”; its 1 file moved to Unsorted.'),
    ).toBeInTheDocument();

    await user.click(within(bar).getByRole('button', { name: '+ New folder' }));
    await user.type(within(bar).getByRole('textbox', { name: 'New folder name' }), 'Diagrams');
    await user.click(within(bar).getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(calls).toContainEqual({ url: '/api/admin/media/folders', method: 'POST', body: { name: 'Diagrams' } }),
    );
    expect(await screen.findByText('Created the folder “Diagrams”.')).toBeInTheDocument();
    expect(calls.at(-1)!.url).toBe('/api/admin/media?folder=f-new');
  });

  it('says why a folder was not created', async () => {
    mockApi((c) =>
      c.method === 'POST' && c.url === '/api/admin/media/folders'
        ? [409, { error: 'there is already a folder called Worksheets' }]
        : undefined,
    );
    const user = userEvent.setup();
    render(<MediaLibrary />);
    const bar = await screen.findByRole('navigation', { name: 'Folders' });
    await user.click(within(bar).getByRole('button', { name: '+ New folder' }));
    await user.type(within(bar).getByRole('textbox', { name: 'New folder name' }), 'worksheets');
    await user.click(within(bar).getByRole('button', { name: 'Create' }));
    expect(await within(bar).findByRole('alert')).toHaveTextContent(
      'Not created: there is already a folder called Worksheets.',
    );
  });

  it('shows a folder as a grid or a list, remembered per folder', async () => {
    mockApi();
    const user = userEvent.setup();
    render(<MediaLibrary />);
    await screen.findByRole('list', { name: 'Media' });
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'List' }));
    const table = screen.getByRole('table', { name: 'Media in All media' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['', 'Name', 'Type', 'Size', 'Used', 'Folder', 'Uploaded']);
    const pdf = within(table).getByRole('row', { name: /worksheet\.pdf/ });
    expect(pdf).toHaveTextContent('PDF');
    expect(pdf).toHaveTextContent('Worksheets');
    expect(JSON.parse(localStorage.getItem('cs-media-view')!)).toEqual({ all: 'list' });

    // Opening a row shows its details under it.
    await user.click(within(table).getByRole('button', { name: /graph\.png/ }));
    expect(await screen.findByRole('region', { name: 'Details of graph.png' })).toBeInTheDocument();

    // Another folder has its own view (grid until chosen); coming back keeps the list.
    await user.click(screen.getByRole('button', { name: 'Unsorted (1)' }));
    expect(await screen.findByRole('list', { name: 'Media' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'All media (2)' }));
    expect(await screen.findByRole('table', { name: 'Media in All media' })).toBeInTheDocument();
  });

  it('selects files and moves them to a folder', async () => {
    const calls = mockApi((c) => (c.url === '/api/admin/media/move' ? [200, { moved: 2 }] : undefined));
    const user = userEvent.setup();
    render(<MediaLibrary />);
    const list = await screen.findByRole('list', { name: 'Media' });
    await user.click(within(list).getByRole('checkbox', { name: 'Select graph.png' }));
    await user.click(within(list).getByRole('checkbox', { name: 'Select worksheet.pdf' }));
    const bar = screen.getByRole('group', { name: 'Selected files' });
    expect(bar).toHaveTextContent('2 selected');
    await user.selectOptions(within(bar).getByRole('combobox', { name: 'Move to' }), 'Worksheets');
    await user.click(within(bar).getByRole('button', { name: 'Move' }));
    await waitFor(() =>
      expect(calls).toContainEqual({
        url: '/api/admin/media/move',
        method: 'POST',
        body: { ids: [IMG, PDF], folder: FOLDER },
      }),
    );
    expect(await screen.findByText('Moved 2 files to Worksheets.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Selected files' })).toBeNull();
  });

  it('moves one file from its details, and uploads into the open folder', async () => {
    const calls = mockApi((c) => (c.url === '/api/admin/media/move' ? [200, { moved: 1 }] : undefined));
    const user = userEvent.setup();
    const upload = vi.fn(async () => ({ ...items[1]!, id: 'new-id', kind: 'file' as const, original_name: 'new.pdf' }));
    render(<MediaLibrary upload={upload} />);
    await user.click(await screen.findByRole('button', { name: /graph\.png/ }));
    const detail = await screen.findByRole('region', { name: 'Details of graph.png' });
    await user.selectOptions(within(detail).getByRole('combobox', { name: 'Folder' }), 'Worksheets');
    await waitFor(() =>
      expect(calls).toContainEqual({
        url: '/api/admin/media/move',
        method: 'POST',
        body: { ids: [IMG], folder: FOLDER },
      }),
    );
    expect(await screen.findByText('Moved “graph.png” to Worksheets.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Worksheets (1)' }));
    expect(await screen.findByRole('heading', { name: 'Worksheets' })).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Upload files'), new File(['%PDF-'], 'new.pdf'));
    expect(await screen.findByText('Uploaded “new.pdf” to Worksheets.')).toBeInTheDocument();
    expect(calls).toContainEqual({
      url: '/api/admin/media/move',
      method: 'POST',
      body: { ids: ['new-id'], folder: FOLDER },
    });
  });
});

describe('editor: insert from the media library', () => {
  it('lists the library and hands back the chosen item', async () => {
    mockApi();
    const onPick = vi.fn();
    render(<MediaPicker onPick={onPick} onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Insert from the media library' })).toHaveFocus();
    const list = await screen.findByRole('list', { name: 'Media to insert' });
    const choice = within(list).getByRole('button', { name: /graph\.png/ });
    expect(choice).toHaveAccessibleName(/^Insert graph\.png/);
    await userEvent.setup().click(choice);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: IMG, alt: 'A graph' }));
  });

  it('narrows the picker to a folder', async () => {
    const calls = mockApi();
    render(<MediaPicker onPick={() => {}} onClose={() => {}} />);
    const folder = await screen.findByRole('combobox', { name: 'Folder' });
    await waitFor(() => expect(within(folder).getByRole('option', { name: 'Worksheets' })).toBeInTheDocument());
    await userEvent.setup().selectOptions(folder, 'Worksheets');
    await waitFor(() => expect(calls.at(-1)!.url).toBe(`/api/admin/media?folder=${FOLDER}`));
    const list = await screen.findByRole('list', { name: 'Media to insert' });
    await waitFor(() => expect(within(list).getAllByRole('button')).toHaveLength(1));
  });
});
