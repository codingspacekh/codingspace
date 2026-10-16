import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { createPost, PostError, saveDraft } from '@/server/admin/posts';
import { fileKey, imageKey, uploadKey } from '@/lib/media-urls';
import { deleteMedia, getMedia, listMedia, updateMedia } from '@/server/media/library';
import { localStore, type LocalStore } from '@/server/media/store';
import { finishUpload, startUpload } from '@/server/media/uploads';
import { ownerSession, serviceClient } from '../support/admin-users';

// Uploads end to end against a real database (03 ADM-10): presign → PUT → check and convert →
// catalogue; the library's "used in" comes from the posts' content; a used file can't be deleted.

let owner: SupabaseClient;
let service: SupabaseClient;
let dir: string;
let store: LocalStore;

/** Step 1 and the browser's PUT, as the editor does them. */
async function upload(kind: 'image' | 'file', name: string, body: Uint8Array) {
  const { id, url, headers } = await startUpload(store, { kind, name, size: body.length });
  const q = Object.fromEntries(new URL(url).searchParams);
  expect(store.verifyPut(uploadKey(id), q, headers['content-type'], body.length)).toBeNull();
  await store.write(uploadKey(id), body, { contentType: headers['content-type'], cacheControl: 'no-store' });
  return id;
}

async function photo(width: number, height: number, colour = '#c03030') {
  return sharp({ create: { width, height, channels: 3, background: colour } })
    .jpeg()
    .withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '11/1 33/1 0/1' } })
    .toBuffer();
}

async function cleanUp() {
  await service.from('posts').delete().like('slug', 'it-media-%');
  await service.from('media').delete().like('original_name', 'it-media-%');
}

beforeAll(async () => {
  owner = await ownerSession();
  service = serviceClient();
  dir = mkdtempSync(join(tmpdir(), 'it-media-'));
  store = localStore(dir, 'it-secret');
  await cleanUp();
});
afterAll(async () => {
  await cleanUp();
  rmSync(dir, { recursive: true, force: true });
});

describe('image upload', () => {
  let id: string;

  it('converts a photo to AVIF and WebP variants and catalogues it', async () => {
    const bytes = await photo(1200, 800);
    id = await upload('image', 'it-media-photo.jpg', bytes);
    const media = await finishUpload(owner, store, id, {
      kind: 'image',
      name: 'it-media-photo.jpg',
      alt: 'A red card',
    });
    expect(media).toMatchObject({
      id,
      kind: 'image',
      mime: 'image/jpeg',
      bytes: bytes.length,
      width: 1200,
      height: 800,
      widths: [480, 960, 1200],
      alt: 'A red card',
      original_name: 'it-media-photo.jpg',
      use_count: 0,
      duplicate: false,
    });
    for (const w of [480, 960, 1200]) {
      for (const f of ['avif', 'webp'] as const) {
        const stored = await store.read(imageKey(id, w, f));
        expect(stored?.meta).toEqual({
          contentType: `image/${f}`,
          cacheControl: 'public, max-age=31536000, immutable',
        });
        expect((await sharp(stored!.body).metadata()).exif).toBeUndefined();
      }
    }
    expect(await store.head(uploadKey(id))).toBeNull();
  });

  it('reuses the first copy when the same file is uploaded again', async () => {
    const again = await upload('image', 'it-media-again.jpg', await photo(1200, 800));
    const media = await finishUpload(owner, store, again, { kind: 'image', name: 'it-media-again.jpg' });
    expect(media).toMatchObject({ id, duplicate: true });
    expect(await store.head(imageKey(again, 480, 'webp'))).toBeNull();
    expect(await store.head(uploadKey(again))).toBeNull();
  });

  it('refuses content that is not what the name says, and removes the upload', async () => {
    const bad = await upload('image', 'it-media-evil.png', Buffer.from('<svg onload="alert(1)"/>'));
    await expect(finishUpload(owner, store, bad, { kind: 'image', name: 'it-media-evil.png' })).rejects.toMatchObject({
      status: 422,
    });
    expect(await store.head(uploadKey(bad))).toBeNull();
    const { count } = await service.from('media').select('*', { count: 'exact', head: true }).eq('id', bad);
    expect(count).toBe(0);
  });

  it('refuses a damaged image', async () => {
    const bad = await upload('image', 'it-media-broken.jpg', (await photo(400, 300, '#00f')).subarray(0, 200));
    await expect(finishUpload(owner, store, bad, { kind: 'image', name: 'it-media-broken.jpg' })).rejects.toThrow(
      PostError,
    );
  });

  it('says so when the upload never arrived', async () => {
    const { id: missing } = await startUpload(store, { kind: 'image', name: 'x.png', size: 10 });
    await expect(finishUpload(owner, store, missing, { kind: 'image', name: 'x.png' })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('refuses SVG before anything is uploaded', async () => {
    await expect(startUpload(store, { kind: 'image', name: 'logo.svg', size: 10 })).rejects.toMatchObject({
      status: 422,
    });
  });
});

describe('file upload and the library', () => {
  let fileId: string;
  let imageId: string;

  beforeAll(async () => {
    fileId = await upload('file', 'it-media-worksheet 1.pdf', Buffer.from('%PDF-1.7\n%…\n'));
    await finishUpload(owner, store, fileId, { kind: 'file', name: 'it-media-worksheet 1.pdf' });
    imageId = await upload(
      'image',
      'it-media-graph.png',
      await sharp({
        create: { width: 300, height: 200, channels: 3, background: '#0a0' },
      })
        .png()
        .toBuffer(),
    );
    await finishUpload(owner, store, imageId, { kind: 'image', name: 'it-media-graph.png' });
  });

  it('stores a file as a download with its name', async () => {
    const stored = await store.read(fileKey(fileId));
    expect(stored?.meta).toEqual({
      contentType: 'application/pdf',
      cacheControl: 'public, max-age=31536000, immutable',
      contentDisposition: `attachment; filename="it-media-worksheet 1.pdf"; filename*=UTF-8''it-media-worksheet%201.pdf`,
    });
  });

  it('lists newest first, filters by kind and searches names', async () => {
    const all = await listMedia(owner, { q: 'it-media-' });
    expect(all.items.map((m) => m.original_name).slice(0, 2)).toEqual([
      'it-media-graph.png',
      'it-media-worksheet 1.pdf',
    ]);
    expect((await listMedia(owner, { q: 'it-media-', kind: 'file' })).items.map((m) => m.id)).toEqual([fileId]);
    expect((await listMedia(owner, { q: 'graph' })).items.map((m) => m.id)).toContain(imageId);
    // LIKE wildcards are literal.
    expect((await listMedia(owner, { q: 'it_media' })).items).toEqual([]);
  });

  it('knows which posts use a file, and refuses to delete it while they do', async () => {
    const { id: postId } = await createPost(owner, { kind: 'life', title: 'it-media post' });
    const { data } = await service.from('posts').select('revision').eq('id', postId).single();
    await saveDraft(owner, postId, data!.revision, {
      content_json: {
        type: 'doc',
        content: [
          { type: 'image', attrs: { media: imageId, widths: [300], alt: 'g' } },
          { type: 'file', attrs: { media: fileId, name: 'Worksheet' } },
        ],
      },
    });
    const media = await getMedia(owner, fileId);
    expect(media.use_count).toBe(1);
    expect(media.used_by).toEqual([
      {
        id: postId,
        title: 'it-media post',
        slug: expect.stringMatching(/^it-media-post/),
        in_draft: true,
        in_live: false,
      },
    ]);
    expect((await listMedia(owner, { q: 'it-media-', unused: '1' })).items.map((m) => m.id)).not.toContain(fileId);
    await expect(deleteMedia(owner, store, fileId)).rejects.toMatchObject({ status: 409 });
    expect(await store.head(fileKey(fileId))).not.toBeNull();
  });

  it('renames a file and sets its default alt text', async () => {
    await updateMedia(owner, imageId, { alt: 'A green rectangle', original_name: 'it-media-green.png' });
    expect(await getMedia(owner, imageId)).toMatchObject({
      alt: 'A green rectangle',
      original_name: 'it-media-green.png',
    });
    await expect(updateMedia(owner, imageId, { alt: '', original_name: '   ' })).rejects.toMatchObject({ status: 422 });
  });

  it('deletes an unused file and its stored objects', async () => {
    await service.from('posts').delete().like('slug', 'it-media-%');
    const { keys } = await deleteMedia(owner, store, imageId);
    expect(keys).toEqual([imageKey(imageId, 300, 'avif'), imageKey(imageId, 300, 'webp')]);
    for (const k of keys) expect(await store.head(k)).toBeNull();
    await expect(getMedia(owner, imageId)).rejects.toMatchObject({ status: 404 });
  });
});
