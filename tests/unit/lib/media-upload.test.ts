import { mediaNode, uploadMedia, UploadError, type UploadedMedia } from '@/lib/media-upload';

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
