import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { APP_PART_BYTES } from '@/lib/media-rules';
import { fileKey } from '@/lib/media-urls';
import { deleteProject, listProjects, saveProject } from '@/server/admin/site';
import { abortAppUpload, finishAppUpload, partUrls, startAppUpload } from '@/server/media/app-uploads';
import { deleteMedia } from '@/server/media/library';
import { localStore, type LocalStore } from '@/server/media/store';
import { ownerSession, serviceClient } from '../support/admin-users';

// App downloads end to end against a real database (2026-10-20): start → part URLs → the
// browser's PUTs → join, stream-check, catalogue → a project's download button → in use.

let owner: SupabaseClient;
let service: SupabaseClient;
let dir: string;
let store: LocalStore;

/** Steps 1 and 2 and the browser's PUTs, as the Downloads editor does them. Returns the ids. */
async function send(name: string, body: Uint8Array, { skip }: { skip?: number } = {}) {
  const start = await startAppUpload(store, { kind: 'app', name, size: body.length });
  expect(start).toMatchObject({ partSize: APP_PART_BYTES, parts: Math.ceil(body.length / APP_PART_BYTES) });
  const parts = Array.from({ length: start.parts }, (_, i) => i + 1);
  const { urls } = await partUrls(store, start.id, { uploadId: start.uploadId, parts });
  for (const n of parts) {
    if (n === skip) continue;
    const q = Object.fromEntries(new URL(urls[n]!).searchParams);
    expect(store.verifyPart(fileKey(start.id), q)).toBeNull();
    const part = body.subarray((n - 1) * APP_PART_BYTES, n * APP_PART_BYTES);
    expect(await store.writePart(fileKey(start.id), start.uploadId, n, part)).toBe(true);
  }
  return start;
}

const finish = (name: string, body: Uint8Array, s: { id: string; uploadId: string }) =>
  finishAppUpload(owner, store, s.id, { kind: 'app', name, size: body.length, uploadId: s.uploadId });

/** A Windows program of 2½ parts: "MZ", then filler that differs per `seed`. */
const program = (seed: number) => {
  const b = new Uint8Array(APP_PART_BYTES * 2.5);
  b.set([0x4d, 0x5a]);
  b[100] = seed;
  return b;
};

async function cleanUp() {
  for (const p of await listProjects(owner)) if (p.name.startsWith('IT App')) await deleteProject(owner, p.id);
  await service.from('media').delete().like('original_name', 'it-app-%');
}

beforeAll(async () => {
  owner = await ownerSession();
  service = serviceClient();
  dir = mkdtempSync(join(tmpdir(), 'it-app-'));
  store = localStore(dir, 'it-secret');
  await cleanUp();
});
afterAll(async () => {
  await cleanUp();
  rmSync(dir, { recursive: true, force: true });
});

describe('app upload', () => {
  const body = program(1);
  let id: string;

  it('joins the parts, checks the whole file once and catalogues it', async () => {
    const s = await send('it-app-Setup 1.0.exe', body);
    const media = await finish('it-app-Setup 1.0.exe', body, s);
    id = media.id;
    expect(media).toMatchObject({
      id: s.id,
      kind: 'app',
      mime: 'application/vnd.microsoft.portable-executable',
      bytes: body.length,
      original_name: 'it-app-Setup 1.0.exe',
      duplicate: false,
    });
    const { data } = await service.from('media').select('sha256').eq('id', id).single();
    expect(data!.sha256).toBe(createHash('sha256').update(body).digest('hex'));
    const stored = await store.read(fileKey(id));
    expect(stored?.body.equals(body)).toBe(true);
    expect(stored?.meta).toMatchObject({
      contentType: 'application/vnd.microsoft.portable-executable',
      contentDisposition: expect.stringContaining('attachment; filename="it-app-Setup 1.0.exe"'),
    });
  });

  it('keeps the first copy when the same file comes again', async () => {
    const s = await send('it-app-again.exe', body);
    expect(await finish('it-app-again.exe', body, s)).toMatchObject({ id, duplicate: true });
    expect(await store.head(fileKey(s.id))).toBeNull();
  });

  it('refuses an upload with a missing part, and one whose content isn’t what its name says', async () => {
    const other = program(2);
    const missing = await send('it-app-missing.exe', other, { skip: 2 });
    await expect(finish('it-app-missing.exe', other, missing)).rejects.toMatchObject({ status: 409 });

    const s = await send('it-app-fake.dmg', other);
    await expect(finish('it-app-fake.dmg', other, s)).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(/doesn’t look like a Mac disk image/),
    });
    expect(await store.head(fileKey(s.id))).toBeNull();
  });

  it('refuses a size that doesn’t match the parts', async () => {
    const s = await send('it-app-short.exe', body);
    await expect(
      finishAppUpload(owner, store, s.id, {
        kind: 'app',
        name: 'it-app-short.exe',
        size: body.length - 1,
        uploadId: s.uploadId,
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(await store.head(fileKey(s.id))).toBeNull();
  });

  it('can be cancelled', async () => {
    const s = await send('it-app-cancel.exe', program(3));
    await abortAppUpload(store, s.id, { uploadId: s.uploadId });
    await expect(finish('it-app-cancel.exe', program(3), s)).rejects.toMatchObject({ status: 409 });
  });

  it('becomes a project’s download button, and then can’t be deleted', async () => {
    const { id: project } = await saveProject(owner, null, {
      name: 'IT App EasyMedia',
      description: 'A video editor.',
      downloads: [
        { label: 'Windows', note: 'Installer', platform: 'windows', media: id },
        { label: 'Linux', note: '', platform: '', url: 'https://github.com/codingspacekh/EasyMedia/releases' },
      ],
    });
    const saved = (await listProjects(owner)).find((p) => p.id === project)!;
    expect(saved.downloads).toEqual([
      {
        label: 'Windows',
        note: 'Installer',
        platform: 'windows',
        media: id,
        name: 'it-app-Setup 1.0.exe',
        bytes: body.length,
        sha256: createHash('sha256').update(body).digest('hex'),
      },
      { label: 'Linux', note: '', url: 'https://github.com/codingspacekh/EasyMedia/releases' },
    ]);
    await expect(deleteMedia(owner, store, id)).rejects.toMatchObject({ status: 409 });
    await expect(
      saveProject(owner, project, {
        name: 'IT App EasyMedia',
        description: 'x',
        downloads: [{ label: 'Bad', media: 'nope' }],
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
});
