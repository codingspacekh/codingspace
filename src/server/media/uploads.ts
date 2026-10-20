import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { classifyUpload, cleanFileName, type MediaKind } from '@/lib/media-rules';
import { fileKey, imageKey, uploadKey } from '@/lib/media-urls';
import { ImageError, processImage } from './image';
import { checkContent, sniffImage } from './sniff';
import { IMMUTABLE, type MediaStore } from './store';
import { ApiError } from '@/server/admin/errors';

/**
 * Uploads (03 ADM-10, §8.4), in two steps so the bytes never pass through a Vercel function
 * on the way in (its request limit is 4.5 MB):
 *   1. startUpload: checks name, type and size, and returns a presigned PUT to u/<id>,
 *      valid 10 minutes, for exactly that Content-Type and length.
 *   2. finishUpload: reads u/<id> back, checks the bytes are what the name says (magic
 *      bytes, UTF-8 text), re-encodes images (EXIF gone), stores the results under
 *      i/<id>/… or f/<id>, records the media row and removes u/<id>.
 */

export const UPLOAD_EXPIRES_IN = 600;

export type MediaItem = {
  id: string;
  kind: MediaKind;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  widths: number[];
  alt: string;
  original_name: string;
  created_at: string;
  use_count: number;
  /** Its folder in the library (null: Unsorted). */
  folder_id?: string | null;
};

const uuid = z.uuid();
const kind = z.enum(['image', 'file']);

export const uploadRequest = z.object({
  kind,
  name: z.string().min(1).max(500),
  size: z.number().int().positive(),
});

function refuse(status: 400 | 404 | 409 | 422, message: string): never {
  throw new ApiError(status, message);
}

export async function startUpload(store: MediaStore, input: unknown) {
  const body = uploadRequest.safeParse(input);
  if (!body.success) refuse(422, z.prettifyError(body.error));
  const checked = classifyUpload(body.data.kind, body.data.name, body.data.size);
  if (!checked.ok) refuse(422, checked.error);
  const id = randomUUID();
  const url = await store.presignPut(uploadKey(id), {
    contentType: checked.type.mime,
    contentLength: body.data.size,
    expiresIn: UPLOAD_EXPIRES_IN,
  });
  // The browser must send exactly this Content-Type: it is part of the signature.
  return { id, url, headers: { 'content-type': checked.type.mime } };
}

export const finishRequest = z.object({
  kind,
  name: z.string().min(1).max(500),
  alt: z.string().max(500).default(''),
});

/** RFC 6266: a plain ASCII fallback plus the real (UTF-8) name. */
export function attachment(name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]|["\\%;]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

const SELECT = 'id, kind, mime, bytes, width, height, widths, alt, original_name, created_at, use_count';

export async function mediaItem(supabase: SupabaseClient, id: string): Promise<MediaItem> {
  const { data, error } = await supabase.from('admin_media').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw new Error(`admin_media: ${error.message}`);
  if (!data) refuse(404, 'file not found');
  return data as MediaItem;
}

export async function finishUpload(
  supabase: SupabaseClient,
  store: MediaStore,
  id: string,
  input: unknown,
): Promise<MediaItem & { duplicate: boolean }> {
  const mediaId = uuid.safeParse(id);
  if (!mediaId.success) refuse(400, 'bad id');
  const body = finishRequest.safeParse(input);
  if (!body.success) refuse(422, z.prettifyError(body.error));
  const incoming = uploadKey(mediaId.data);
  const written: string[] = [];

  try {
    const head = await store.head(incoming);
    if (!head) refuse(404, 'the upload didn’t arrive (or took longer than 10 minutes): try again');
    const checked = classifyUpload(body.data.kind, body.data.name, head.size);
    if (!checked.ok) refuse(422, checked.error);
    const type = checked.type;

    const bytes = await store.get(incoming);
    const problem = checkContent(type, bytes);
    if (problem) refuse(422, problem);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const name = cleanFileName(body.data.name) || `upload.${type.ext}`;

    // The same file again: reuse the first copy.
    const { data: same, error } = await supabase
      .from('media')
      .select('id')
      .eq('kind', type.kind)
      .eq('sha256', sha256)
      .maybeSingle();
    if (error) throw new Error(`media: ${error.message}`);
    if (same) return { ...(await mediaItem(supabase, same.id as string)), duplicate: true };

    let size: { width: number | null; height: number | null; widths: number[] } = {
      width: null,
      height: null,
      widths: [],
    };
    if (type.kind === 'image') {
      const image = await processImage(bytes);
      for (const v of image.variants) {
        const key = imageKey(mediaId.data, v.width, v.format);
        await store.put(key, v.data, { contentType: `image/${v.format}`, cacheControl: IMMUTABLE });
        written.push(key);
      }
      size = { width: image.width, height: image.height, widths: image.widths };
    } else {
      const key = fileKey(mediaId.data);
      await store.put(key, bytes, {
        contentType: type.mime.startsWith('text/') ? `${type.mime}; charset=utf-8` : type.mime,
        cacheControl: IMMUTABLE,
        contentDisposition: attachment(name),
      });
      written.push(key);
    }

    const { data: added, error: addError } = await supabase.rpc('admin_add_media', {
      p_id: mediaId.data,
      p_kind: type.kind,
      p_mime: type.kind === 'image' ? sniffImage(bytes)! : type.mime,
      p_bytes: bytes.length,
      p_sha256: sha256,
      p_width: size.width,
      p_height: size.height,
      p_widths: size.widths,
      p_alt: body.data.alt,
      p_original_name: name,
    });
    if (addError) {
      if (addError.code === '23505') refuse(409, 'that file id is already taken: upload again');
      throw new Error(`admin_add_media: ${addError.message}`);
    }
    const { id: savedId, duplicate } = added as { id: string; duplicate: boolean };
    if (duplicate) await store.delete(written.splice(0));
    return { ...(await mediaItem(supabase, savedId)), duplicate };
  } catch (e) {
    if (written.length) await store.delete(written).catch((err) => console.error('media cleanup failed', err));
    if (e instanceof ImageError) refuse(422, e.message);
    throw e;
  } finally {
    await store.delete([incoming]).catch((err) => console.error('upload cleanup failed', err));
  }
}
