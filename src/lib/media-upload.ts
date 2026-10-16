import { api } from './admin-api';
import { classifyUpload, type MediaKind } from './media-rules';

/**
 * The browser's half of an upload (03 ADM-10; server: src/server/media/uploads.ts):
 * check the file here first, ask for a presigned URL, PUT the file straight to storage,
 * then ask the server to check and convert it.
 */

export type UploadedMedia = {
  id: string;
  kind: MediaKind;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  widths: number[];
  alt: string;
  original_name: string;
  duplicate?: boolean;
};

export class UploadError extends Error {}

type Fetch = typeof fetch;

/** The server's reason when it is a sentence for the owner; codes like "server_error" get the fallback. */
function message(data: unknown, fallback: string): string {
  const error = (data as { error?: unknown } | null)?.error;
  return typeof error === 'string' && !/^[a-z_]+$/.test(error) ? error : fallback;
}

export async function uploadMedia(file: File, kind: MediaKind, put: Fetch = fetch): Promise<UploadedMedia> {
  const checked = classifyUpload(kind, file.name, file.size);
  if (!checked.ok) throw new UploadError(checked.error);

  const start = await api<{ id: string; url: string; headers: Record<string, string>; error?: string }>(
    '/api/admin/media/uploads',
    { method: 'POST', body: { kind, name: file.name, size: file.size } },
  );
  if (start.status !== 200) throw new UploadError(message(start.data, `Couldn’t start the upload (${start.status}).`));

  let sent: Response;
  try {
    sent = await put(start.data.url, { method: 'PUT', headers: start.data.headers, body: file });
  } catch {
    throw new UploadError('The upload was interrupted. Check the connection and try again.');
  }
  if (!sent.ok) throw new UploadError(`The storage refused the upload (${sent.status}). Try again.`);

  const done = await api<UploadedMedia & { error?: string }>(`/api/admin/media/uploads/${start.data.id}`, {
    method: 'POST',
    body: { kind, name: file.name },
  });
  if (done.status !== 200 && done.status !== 201) {
    throw new UploadError(message(done.data, `The upload couldn’t be processed (${done.status}).`));
  }
  return done.data;
}

/** The node the editor inserts for an uploaded file (content format, D6). */
export function mediaNode(m: UploadedMedia) {
  return m.kind === 'image'
    ? {
        type: 'image',
        attrs: { media: m.id, widths: m.widths, width: m.width, height: m.height, alt: m.alt, caption: null },
      }
    : { type: 'file', attrs: { media: m.id, name: m.original_name, size: m.bytes } };
}
