import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MediaLibrary, MediaPicker } from '@/views/admin/media-library';

const IMG = '3f2b8c1e-9a4d-4c6b-8e2f-1a2b3c4d5e6f';
const PDF = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
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
  },
];
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
      if (call.method === 'GET' && url.startsWith('/api/admin/media?')) {
        const q = new URLSearchParams(url.split('?')[1]);
        const list = items.filter(
          (m) =>
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
});
