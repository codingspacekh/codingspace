// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { localStore, mediaStore, r2Store } from '@/server/media/store';

const ID = '3f2b8c1e-9a4d-4c6b-8e2f-1a2b3c4d5e6f';
const R2 = {
  accountId: '0123456789abcdef0123456789abcdef',
  accessKeyId: 'AKID',
  secretAccessKey: 'SECRET',
  bucket: 'media',
};

describe('R2 store (S3 API)', () => {
  it('presigns a PUT for exactly this type and length, valid 10 minutes, with no checksum', async () => {
    const url = new URL(
      await r2Store(R2).presignPut(`u/${ID}`, { contentType: 'image/png', contentLength: 1234, expiresIn: 600 }),
    );
    expect(url.origin).toBe('https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com');
    expect(url.pathname).toBe(`/media/u/${ID}`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(url.searchParams.get('X-Amz-SignedHeaders')!.split(';')).toEqual(
      expect.arrayContaining(['content-length', 'content-type', 'host']),
    );
    // A checksum in the URL would only match an empty body (browser uploads would fail).
    expect([...url.searchParams.keys()].some((k) => /checksum/i.test(k))).toBe(false);
  });

  function fakeClient(reply: (cmd: unknown) => unknown) {
    const sent: unknown[] = [];
    return {
      sent,
      client: {
        send: vi.fn(async (cmd: unknown) => {
          sent.push(cmd);
          return reply(cmd);
        }),
      },
    };
  }

  it('reads, writes with headers, and deletes one key at a time', async () => {
    const { sent, client } = fakeClient((cmd) =>
      cmd instanceof GetObjectCommand ? { Body: { transformToByteArray: async () => new Uint8Array([1, 2]) } } : {},
    );
    const store = r2Store(R2, client as never);
    expect(await store.get('f/x')).toEqual(new Uint8Array([1, 2]));
    await store.put('f/x', new Uint8Array([1]), {
      contentType: 'application/pdf',
      cacheControl: 'public, max-age=31536000, immutable',
      contentDisposition: 'attachment; filename="a.pdf"',
    });
    await store.delete(['a', 'b']);
    const put = sent.find((c) => c instanceof PutObjectCommand) as PutObjectCommand;
    expect(put.input).toMatchObject({
      Bucket: 'media',
      Key: 'f/x',
      ContentType: 'application/pdf',
      ContentDisposition: 'attachment; filename="a.pdf"',
    });
    expect(
      sent.filter((c) => c instanceof DeleteObjectCommand).map((c) => (c as DeleteObjectCommand).input.Key),
    ).toEqual(['a', 'b']);
  });

  it('heads an object: its size, or null when missing', async () => {
    const missing = new S3ServiceException({ name: 'NotFound', $fault: 'client', $metadata: { httpStatusCode: 404 } });
    const { client } = fakeClient((cmd) => {
      if (cmd instanceof HeadObjectCommand && cmd.input.Key === 'gone') throw missing;
      return { ContentLength: 42 };
    });
    const store = r2Store(R2, client as never);
    expect(await store.head('here')).toEqual({ size: 42 });
    expect(await store.head('gone')).toBeNull();
  });

  describe('uploads in parts (app downloads)', () => {
    const notFound = () =>
      new S3ServiceException({ name: 'NoSuchUpload', $fault: 'client', $metadata: { httpStatusCode: 404 } });

    it('starts one with the download’s headers, and presigns each part', async () => {
      const { sent, client } = fakeClient(() => ({ UploadId: 'up-1' }));
      const store = r2Store(R2, client as never);
      const headers = { contentType: 'application/zip', cacheControl: 'x', contentDisposition: 'attachment' };
      expect(await store.createMultipart(`f/${ID}`, headers)).toBe('up-1');
      expect((sent[0] as CreateMultipartUploadCommand).input).toMatchObject({
        Bucket: 'media',
        Key: `f/${ID}`,
        ContentType: 'application/zip',
        ContentDisposition: 'attachment',
      });
      const url = new URL(await r2Store(R2).presignPart(`f/${ID}`, 'up-1', 3, 3600));
      expect(url.pathname).toBe(`/media/f/${ID}`);
      expect([url.searchParams.get('partNumber'), url.searchParams.get('uploadId')]).toEqual(['3', 'up-1']);
      expect(url.searchParams.get('X-Amz-Expires')).toBe('3600');
      expect([...url.searchParams.keys()].some((k) => /checksum/i.test(k))).toBe(false);
    });

    it('completes with the parts R2 lists (page by page), in order', async () => {
      const { sent, client } = fakeClient((cmd) => {
        if (!(cmd instanceof ListPartsCommand)) return {};
        return cmd.input.PartNumberMarker
          ? { Parts: [{ PartNumber: 1, ETag: '"a"' }], IsTruncated: false }
          : {
              Parts: [
                { PartNumber: 3, ETag: '"c"' },
                { PartNumber: 2, ETag: '"b"' },
              ],
              IsTruncated: true,
              NextPartNumberMarker: '3',
            };
      });
      expect(await r2Store(R2, client as never).completeMultipart(`f/${ID}`, 'up-1', 3)).toBe(true);
      const done = sent.find((c) => c instanceof CompleteMultipartUploadCommand) as CompleteMultipartUploadCommand;
      expect(done.input.MultipartUpload!.Parts!.map((p) => p.PartNumber)).toEqual([1, 2, 3]);
    });

    it('completes nothing when a part is missing or the upload is gone', async () => {
      const { sent, client } = fakeClient((cmd) =>
        cmd instanceof ListPartsCommand
          ? {
              Parts: [
                { PartNumber: 1, ETag: '"a"' },
                { PartNumber: 3, ETag: '"c"' },
              ],
            }
          : {},
      );
      expect(await r2Store(R2, client as never).completeMultipart(`f/${ID}`, 'up-1', 3)).toBe(false);
      expect(sent.some((c) => c instanceof CompleteMultipartUploadCommand)).toBe(false);
      const { client: gone } = fakeClient(() => {
        throw notFound();
      });
      expect(await r2Store(R2, gone as never).completeMultipart(`f/${ID}`, 'up-1', 1)).toBe(false);
    });

    it('aborts (an upload already gone is fine) and streams an object', async () => {
      const { sent, client } = fakeClient((cmd) => {
        if (cmd instanceof AbortMultipartUploadCommand) throw notFound();
        return {
          Body: (async function* () {
            yield new Uint8Array([1]);
            yield new Uint8Array([2, 3]);
          })(),
        };
      });
      const store = r2Store(R2, client as never);
      await expect(store.abortMultipart(`f/${ID}`, 'up-1')).resolves.toBeUndefined();
      const got: number[] = [];
      for await (const chunk of store.stream(`f/${ID}`)) got.push(...chunk);
      expect(got).toEqual([1, 2, 3]);
      expect(sent.some((c) => c instanceof GetObjectCommand)).toBe(true);
    });
  });

  it('passes other errors on', async () => {
    const { client } = fakeClient(() => {
      throw new Error('network down');
    });
    await expect(r2Store(R2, client as never).head('x')).rejects.toThrow('network down');
    const { client: empty } = fakeClient(() => ({}));
    await expect(r2Store(R2, empty as never).get('x')).rejects.toThrow(/no body/);
  });
});

describe('local store (MEDIA_STORE=local, for tests)', () => {
  let dir: string;
  let clock = 1_000_000_000_000;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'media-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const make = () => localStore(dir, 'secret', () => clock);

  async function presigned(type = 'image/png', length = 3) {
    const url = new URL(
      await make().presignPut(`u/${ID}`, { contentType: type, contentLength: length, expiresIn: 600 }),
    );
    return Object.fromEntries(url.searchParams);
  }

  it('accepts a PUT that matches the signed type and length, until it expires', async () => {
    const q = await presigned();
    expect(make().verifyPut(`u/${ID}`, q, 'image/png', 3)).toBeNull();
    expect(make().verifyPut(`u/${ID}`, q, 'text/html', 3)).toMatch(/content type/);
    expect(make().verifyPut(`u/${ID}`, q, 'image/png', 4)).toMatch(/length/);
    expect(make().verifyPut(`u/${'0'.repeat(8)}-0000-0000-0000-000000000000`, q, 'image/png', 3)).toMatch(/signature/);
    expect(make().verifyPut(`u/${ID}`, { ...q, type: 'text/html' }, 'text/html', 3)).toMatch(/signature/);
    expect(make().verifyPut(`u/${ID}`, { ...q, sig: 'zz' }, 'image/png', 3)).toMatch(/signature/);
    clock += 601_000;
    expect(make().verifyPut(`u/${ID}`, q, 'image/png', 3)).toBe('expired');
  });

  it('stores bytes with their headers, and deletes them', async () => {
    const store = make();
    await store.put(`f/${ID}`, new Uint8Array([1, 2, 3]), { contentType: 'application/pdf', cacheControl: 'x' });
    expect(await store.head(`f/${ID}`)).toEqual({ size: 3 });
    expect(Array.from(await store.get(`f/${ID}`))).toEqual([1, 2, 3]);
    expect((await store.read(`f/${ID}`))?.meta).toEqual({ contentType: 'application/pdf', cacheControl: 'x' });
    await store.delete([`f/${ID}`]);
    expect(await store.head(`f/${ID}`)).toBeNull();
    expect(await store.read(`f/${ID}`)).toBeNull();
  });

  it('joins an upload in parts, from presigned part URLs, in order', async () => {
    const store = make();
    const key = `f/${ID}`;
    const up = await store.createMultipart(key, { contentType: 'application/zip', cacheControl: 'x' });
    const query = async (n: number) =>
      Object.fromEntries(new URL(await store.presignPart(key, up, n, 600)).searchParams);
    const q2 = await query(2);
    expect(store.verifyPart(key, q2)).toBeNull();
    expect(store.verifyPart(key, { ...q2, partNumber: '3' })).toMatch(/signature/);
    expect(store.verifyPart(`f/${'0'.repeat(8)}-0000-0000-0000-000000000000`, q2)).toMatch(/signature/);
    expect(await store.writePart(key, up, 2, new Uint8Array([3, 4]))).toBe(true);
    expect(await store.writePart(key, up, 1, new Uint8Array([1, 2]))).toBe(true);
    expect(await store.writePart(`f/${'0'.repeat(8)}-0000-0000-0000-000000000000`, up, 1, new Uint8Array())).toBe(
      false,
    );
    expect(await store.completeMultipart(key, up, 3)).toBe(false); // part 3 never came
    expect(await store.completeMultipart(key, up, 2)).toBe(true);
    expect(Array.from(await store.get(key))).toEqual([1, 2, 3, 4]);
    expect((await store.read(key))?.meta).toEqual({ contentType: 'application/zip', cacheControl: 'x' });
    const streamed: number[] = [];
    for await (const chunk of store.stream(key)) streamed.push(...chunk);
    expect(streamed).toEqual([1, 2, 3, 4]);
    expect(await store.completeMultipart(key, up, 2)).toBe(false); // already done: the parts are gone
    clock += 601_000;
    expect(store.verifyPart(key, q2)).toBe('expired');
  });

  it('drops an aborted upload’s parts', async () => {
    const store = make();
    const up = await store.createMultipart(`f/${ID}`, { contentType: 'x', cacheControl: 'x' });
    await store.writePart(`f/${ID}`, up, 1, new Uint8Array([1]));
    await store.abortMultipart(`f/${ID}`, up);
    expect(await store.completeMultipart(`f/${ID}`, up, 1)).toBe(false);
    await expect(store.presignPart(`f/${ID}`, '../x', 1, 1)).rejects.toThrow(/bad upload id/);
  });

  it('refuses keys the app never makes (no path tricks)', async () => {
    const store = make();
    await expect(
      store.put('../../etc/passwd', new Uint8Array(), { contentType: 'x', cacheControl: 'x' }),
    ).rejects.toThrow(/bad media key/);
    await expect(store.presignPut('i/../x', { contentType: 'x', contentLength: 1, expiresIn: 1 })).rejects.toThrow();
    expect(await store.read(`i/${ID}/../../x`)).toBeNull();
    expect(make().verifyPut('u/../x', {}, 'x', 1)).toMatch(/signature/);
  });
});

describe('which store', () => {
  it('is R2 when all four R2 settings are present, else none', () => {
    const env = { R2_ACCOUNT_ID: R2.accountId, R2_ACCESS_KEY_ID: 'a', R2_SECRET_ACCESS_KEY: 'b', R2_BUCKET: 'c' };
    expect(mediaStore(env as unknown as NodeJS.ProcessEnv)).not.toBeNull();
    expect(mediaStore({ ...env, R2_BUCKET: '' } as unknown as NodeJS.ProcessEnv)).toBeNull();
  });

  it('is the local folder with MEDIA_STORE=local, but never on Vercel', () => {
    expect(mediaStore({ MEDIA_STORE: 'local' } as unknown as NodeJS.ProcessEnv)).not.toBeNull();
    expect(() => mediaStore({ MEDIA_STORE: 'local', VERCEL: '1' } as unknown as NodeJS.ProcessEnv)).toThrow(
      /not for Vercel/,
    );
  });
});
