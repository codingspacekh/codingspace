import { mediaNode, uploadApp, uploadMedia, UploadError, type UploadedMedia } from '@/lib/media-upload';

const ID = '3f2b8c1e-9a4d-4c6b-8e2f-1a2b3c4d5e6f';
const media: UploadedMedia = {
  id: ID,
  kind: 'image',
  mime: 'image/png',
  bytes: 3,
  width: 10,
  height: 5,
  widths: [10],
  alt: 'x',
  original_name: 'a.png',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe('uploadMedia (browser half)', () => {
  const file = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' });
  let api: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    api = vi.fn();
    vi.stubGlobal('fetch', api);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('asks for a presigned URL, PUTs the file there with the signed type, then finishes', async () => {
    api
      .mockResolvedValueOnce(
        json(200, { id: ID, url: 'https://r2.example/u/x?sig', headers: { 'content-type': 'image/png' } }),
      )
      .mockResolvedValueOnce(json(201, media));
    const put = vi.fn(async () => new Response(null, { status: 200 }));
    expect(await uploadMedia(file, 'image', put)).toEqual(media);
    expect(api.mock.calls[0]![0]).toBe('/api/admin/media/uploads');
    expect(JSON.parse(api.mock.calls[0]![1].body)).toEqual({ kind: 'image', name: 'a.png', size: 3 });
    expect(put).toHaveBeenCalledWith('https://r2.example/u/x?sig', {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: file,
    });
    expect(api.mock.calls[1]![0]).toBe(`/api/admin/media/uploads/${ID}`);
  });

  it('refuses before uploading what the server would refuse', async () => {
    await expect(uploadMedia(new File(['<svg/>'], 'a.svg'), 'image')).rejects.toThrow(/SVG/);
    expect(api).not.toHaveBeenCalled();
  });

  it("passes on the server's reason, or a plain one for error codes", async () => {
    api.mockResolvedValueOnce(json(503, { error: 'Uploads aren’t set up yet (R2 settings missing).' }));
    await expect(uploadMedia(file, 'image')).rejects.toThrow('Uploads aren’t set up yet (R2 settings missing).');
    api.mockResolvedValueOnce(json(500, { error: 'server_error' }));
    await expect(uploadMedia(file, 'image')).rejects.toThrow('Couldn’t start the upload (500).');
  });

  it('reports a refused or interrupted PUT', async () => {
    const start = () => json(200, { id: ID, url: 'https://r2.example/u', headers: {} });
    api.mockResolvedValueOnce(start());
    await expect(uploadMedia(file, 'image', async () => new Response(null, { status: 403 }))).rejects.toThrow(
      'The storage refused the upload (403). Try again.',
    );
    api.mockResolvedValueOnce(start());
    await expect(
      uploadMedia(file, 'image', async () => {
        throw new TypeError('Failed to fetch');
      }),
    ).rejects.toThrow(UploadError);
  });

  it('reports a file the server could not process', async () => {
    api
      .mockResolvedValueOnce(json(200, { id: ID, url: 'https://r2.example/u', headers: {} }))
      .mockResolvedValueOnce(json(422, { error: 'This doesn’t look like a PNG image file.' }));
    await expect(uploadMedia(file, 'image', async () => new Response(null, { status: 200 }))).rejects.toThrow(
      'This doesn’t look like a PNG image file.',
    );
  });
});

describe('mediaNode', () => {
  it('makes an image block with the variant widths and default alt', () => {
    expect(mediaNode(media)).toEqual({
      type: 'image',
      attrs: { media: ID, widths: [10], width: 10, height: 5, alt: 'x', caption: null },
    });
  });

  it('makes a file block named after the file', () => {
    expect(mediaNode({ ...media, kind: 'file', original_name: 'w.pdf', bytes: 99 })).toEqual({
      type: 'file',
      attrs: { media: ID, name: 'w.pdf', size: 99 },
    });
  });
});

/** A stand-in for the browser's fetch to storage. */
const fakePut = (reply: (url: string) => Promise<Response>) =>
  vi.fn<(url: string, init: RequestInit) => Promise<Response>>(reply);

describe('uploadApp: big files in parts (2026-10-20)', () => {
  const app = { ...media, kind: 'app' as const, mime: 'application/zip', bytes: 5, original_name: 'a.zip' };
  // 5 bytes in parts of 2: parts 1, 2 and 3 (the last is 1 byte).
  const file = new File([new Uint8Array([1, 2, 3, 4, 5])], 'a.zip');
  let api: ReturnType<typeof vi.fn>;
  let urlsAsked: number[][];
  beforeEach(() => {
    urlsAsked = [];
    api = vi.fn(async (path: string, init: { method: string; body?: string }) => {
      const body = init.body ? JSON.parse(init.body) : {};
      if (path === '/api/admin/media/uploads') return json(200, { id: ID, uploadId: 'up', partSize: 2, parts: 3 });
      if (path.endsWith('/parts')) {
        urlsAsked.push(body.parts);
        return json(200, {
          urls: Object.fromEntries(
            body.parts.map((n: number) => [n, `https://r2.example/${n}?try=${urlsAsked.length}`]),
          ),
        });
      }
      if (init.method === 'DELETE') return new Response(null, { status: 204 });
      return json(201, app);
    });
    vi.stubGlobal('fetch', api);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  const sizes = async (put: { mock: { calls: [string, RequestInit][] } }) =>
    Promise.all(put.mock.calls.map(async ([, init]) => (init.body as Blob).size));

  it('sends every part once, reports progress, then asks the server to join them', async () => {
    const put = fakePut(async () => new Response(null, { status: 200 }));
    const progress: number[] = [];
    expect(
      await uploadApp(file, { put: put as unknown as typeof fetch, onProgress: (p) => progress.push(p.sent) }),
    ).toEqual(app);
    expect(JSON.parse(api.mock.calls[0]![1].body)).toEqual({ kind: 'app', name: 'a.zip', size: 5 });
    expect(urlsAsked).toEqual([[1, 2, 3]]); // one request for the URLs
    expect(put.mock.calls.map(([url]) => url).sort()).toEqual([1, 2, 3].map((n) => `https://r2.example/${n}?try=1`));
    expect((await sizes(put)).sort()).toEqual([1, 2, 2]);
    expect(progress.at(-1)).toBe(5);
    const finish = api.mock.calls.at(-1)!;
    expect(finish[0]).toBe(`/api/admin/media/uploads/${ID}`);
    expect(JSON.parse(finish[1].body)).toEqual({ kind: 'app', name: 'a.zip', size: 5, uploadId: 'up' });
  });

  it('sends a failed part again on its own, with a fresh URL', async () => {
    vi.useFakeTimers();
    let first = true;
    const put = fakePut(async (url) => {
      if (url.startsWith('https://r2.example/2') && first) {
        first = false;
        throw new TypeError('network down');
      }
      return new Response(null, { status: url.startsWith('https://r2.example/3?try=1') ? 403 : 200 });
    });
    const done = uploadApp(file, { put: put as unknown as typeof fetch });
    await vi.runAllTimersAsync();
    expect(await done).toEqual(app);
    expect(put).toHaveBeenCalledTimes(5); // 1 once, 2 and 3 twice
    expect(urlsAsked.slice(1).flat().sort()).toEqual([2, 3]);
  });

  it('gives up after five tries, and drops what was sent', async () => {
    vi.useFakeTimers();
    const put = fakePut(async () => new Response(null, { status: 503 }));
    const done = uploadApp(file, { put: put as unknown as typeof fetch }).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    expect(await done).toEqual(new UploadError('The upload kept failing. Check the connection and try again.'));
    expect(api.mock.calls.some(([, init]) => init.method === 'DELETE')).toBe(true);
  });

  it('stops when the server won’t give part URLs, without unhandled errors', async () => {
    api.mockImplementation(async (path: string) =>
      path.endsWith('/parts')
        ? json(404, { error: 'That upload is gone.' })
        : path === '/api/admin/media/uploads'
          ? json(200, { id: ID, uploadId: 'up', partSize: 2, parts: 3 })
          : new Response(null, { status: 204 }),
    );
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const put = fakePut(async () => new Response(null, { status: 200 }));
    await expect(uploadApp(file, { put: put as unknown as typeof fetch })).rejects.toThrow('That upload is gone.');
    await new Promise((r) => setTimeout(r, 0));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('stops at once when the storage refuses a part outright', async () => {
    const put = fakePut(async () => new Response(null, { status: 400 }));
    await expect(uploadApp(file, { put: put as unknown as typeof fetch })).rejects.toThrow(/refused part/);
  });

  it('can be cancelled', async () => {
    const controller = new AbortController();
    const put = fakePut(async (): Promise<Response> => {
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(uploadApp(file, { put: put as unknown as typeof fetch, signal: controller.signal })).rejects.toThrow(
      'Upload cancelled.',
    );
    expect(api.mock.calls.some(([, init]) => init.method === 'DELETE')).toBe(true);
  });

  it('refuses what isn’t an app before starting', async () => {
    await expect(uploadApp(new File(['x'], 'notes.pdf'))).rejects.toThrow(/Downloads must be/);
    expect(api).not.toHaveBeenCalled();
  });
});
