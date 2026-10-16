// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
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
