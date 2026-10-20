import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { APP_PART_BYTES, classifyUpload, cleanFileName } from '@/lib/media-rules';
import { fileKey } from '@/lib/media-urls';
import { ApiError } from '@/server/admin/errors';
import { inspect } from './inspect';
import { checkApp } from './sniff';
import { IMMUTABLE, type MediaStore } from './store';
import { attachment, mediaItem, type MediaItem } from './uploads';

/**
 * App downloads (2026-10-20): installers of up to 2 GB for a project's download buttons. Too big
 * for one PUT on a weak connection, and for a Vercel function's memory, so:
 *   1. startAppUpload: checks name, type and size, and starts an upload in parts straight to
 *      f/<id>, with the download's headers already set.
 *   2. partUrls: presigned PUTs for some parts (valid an hour); the browser sends 10 MB parts,
 *      a few at a time, and resends only a part that fails.
 *   3. finishAppUpload: joins the parts, streams the file once (SHA-256 and its first and last
 *      bytes for the type check) and records it. A file that fails a check is deleted.
 *   abortAppUpload: the owner cancelled; the parts are dropped.
 * R2 drops parts of an upload nobody finished after 7 days.
 */

export const PART_EXPIRES_IN = 3600;
/** Part URLs asked for in one request. */
export const MAX_PART_URLS = 20;

const uuid = z.uuid();
const uploadId = z.string().min(1).max(1024);
const name = z.string().min(1).max(500);
const size = z.number().int().positive();

function refuse(status: 400 | 404 | 409 | 422, message: string): never {
  throw new ApiError(status, message);
}

const partsFor = (bytes: number) => Math.ceil(bytes / APP_PART_BYTES);

function checked(fileName: string, bytes: number) {
  const out = classifyUpload('app', fileName, bytes);
  if (!out.ok) refuse(422, out.error);
  return out.type;
}

function idOf(id: string) {
  const out = uuid.safeParse(id);
  if (!out.success) refuse(400, 'bad id');
  return out.data;
}

export const startAppRequest = z.object({ kind: z.literal('app'), name, size });

export async function startAppUpload(store: MediaStore, input: unknown) {
  const body = startAppRequest.safeParse(input);
  if (!body.success) refuse(422, z.prettifyError(body.error));
  const type = checked(body.data.name, body.data.size);
  const id = randomUUID();
  const download = cleanFileName(body.data.name) || `download.${type.ext}`;
  const upload = await store.createMultipart(fileKey(id), {
    contentType: type.mime,
    cacheControl: IMMUTABLE,
    contentDisposition: attachment(download),
  });
  return { id, uploadId: upload, partSize: APP_PART_BYTES, parts: partsFor(body.data.size) };
}

export const partsRequest = z.object({
  uploadId,
  parts: z.array(z.number().int().min(1).max(10000)).min(1).max(MAX_PART_URLS),
});

export async function partUrls(store: MediaStore, id: string, input: unknown) {
  const mediaId = idOf(id);
  const body = partsRequest.safeParse(input);
  if (!body.success) refuse(422, z.prettifyError(body.error));
  const urls: Record<number, string> = {};
  for (const part of new Set(body.data.parts)) {
    urls[part] = await store.presignPart(fileKey(mediaId), body.data.uploadId, part, PART_EXPIRES_IN);
  }
  return { urls };
}

export const finishAppRequest = z.object({
  kind: z.literal('app'),
  name,
  size,
  uploadId,
  alt: z.string().max(500).default(''),
});

export async function finishAppUpload(
  supabase: SupabaseClient,
  store: MediaStore,
  id: string,
  input: unknown,
): Promise<MediaItem & { duplicate: boolean }> {
  const mediaId = idOf(id);
  const body = finishAppRequest.safeParse(input);
  if (!body.success) refuse(422, z.prettifyError(body.error));
  const type = checked(body.data.name, body.data.size);
  const key = fileKey(mediaId);

  const joined = await store.completeMultipart(key, body.data.uploadId, partsFor(body.data.size));
  if (!joined) {
    await store.abortMultipart(key, body.data.uploadId).catch((e) => console.error('abort failed', e));
    refuse(409, 'Some parts of the upload didn’t arrive. Upload the file again.');
  }

  let keep = false;
  try {
    const stored = await store.head(key);
    if (!stored || stored.size !== body.data.size)
      refuse(422, 'The upload’s size doesn’t match the file. Upload it again.');
    const file = await inspect(store.stream(key));
    const problem = checkApp(type, file.head, file.tail);
    if (problem) refuse(422, problem);

    // The same file again: keep the first copy.
    const { data: same, error } = await supabase
      .from('media')
      .select('id')
      .eq('kind', 'app')
      .eq('sha256', file.sha256)
      .maybeSingle();
    if (error) throw new Error(`media: ${error.message}`);
    if (same) return { ...(await mediaItem(supabase, same.id as string)), duplicate: true };

    const { data: added, error: addError } = await supabase.rpc('admin_add_media', {
      p_id: mediaId,
      p_kind: 'app',
      p_mime: type.mime,
      p_bytes: file.bytes,
      p_sha256: file.sha256,
      p_width: null,
      p_height: null,
      p_widths: [],
      p_alt: body.data.alt,
      p_original_name: cleanFileName(body.data.name) || `download.${type.ext}`,
    });
    if (addError) {
      if (addError.code === '23505') refuse(409, 'that file id is already taken: upload again');
      throw new Error(`admin_add_media: ${addError.message}`);
    }
    const { id: savedId, duplicate } = added as { id: string; duplicate: boolean };
    keep = !duplicate;
    return { ...(await mediaItem(supabase, savedId)), duplicate };
  } finally {
    if (!keep) await store.delete([key]).catch((e) => console.error('app cleanup failed', e));
  }
}

export const abortRequest = z.object({ uploadId });

export async function abortAppUpload(store: MediaStore, id: string, input: unknown) {
  const mediaId = idOf(id);
  const body = abortRequest.safeParse(input);
  if (!body.success) refuse(422, z.prettifyError(body.error));
  await store.abortMultipart(fileKey(mediaId), body.data.uploadId);
}
