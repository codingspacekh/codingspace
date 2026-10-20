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

// ── Apps (2026-10-20): up to 2 GB, in parts (server: src/server/media/app-uploads.ts) ──────

export type UploadProgress = { sent: number; total: number };

type AppStart = { id: string; uploadId: string; partSize: number; parts: number };

/** Parts sent at the same time, URLs asked for at once, and tries per part. */
const PARALLEL = 3;
const URL_BATCH = 10;
const TRIES = 5;
/** Worth another try: expired URL, timeout, too many requests (and any 5xx). */
const RETRY = [403, 408, 429];

const cancelled = () => new UploadError('Upload cancelled.');

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((done, fail) => {
    const t = setTimeout(done, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        fail(cancelled());
      },
      { once: true },
    );
  });

/**
 * Sends a program or installer in 10 MB parts, a few at a time; a part that fails (a dropped
 * connection, an expired URL) is sent again on its own, so a long upload survives a bad moment.
 * `onProgress` reports the bytes of finished parts. Cancelling (`signal`) drops what was sent.
 */
export async function uploadApp(
  file: File,
  {
    onProgress,
    signal,
    put = fetch,
  }: { onProgress?: (p: UploadProgress) => void; signal?: AbortSignal; put?: Fetch } = {},
): Promise<UploadedMedia> {
  const checked = classifyUpload('app', file.name, file.size);
  if (!checked.ok) throw new UploadError(checked.error);

  const start = await api<AppStart & { error?: string }>('/api/admin/media/uploads', {
    method: 'POST',
    body: { kind: 'app', name: file.name, size: file.size },
  });
  if (start.status !== 200) throw new UploadError(message(start.data, `Couldn’t start the upload (${start.status}).`));
  const { id, uploadId, partSize, parts } = start.data;
  const base = `/api/admin/media/uploads/${id}`;

  const urls = new Map<number, Promise<string>>();
  function urlFor(part: number): Promise<string> {
    if (!urls.has(part)) {
      const batch = Array.from({ length: Math.min(URL_BATCH, parts - part + 1) }, (_, i) => part + i).filter(
        (n) => n === part || !urls.has(n),
      );
      const asked = api<{ urls: Record<string, string>; error?: string }>(`${base}/parts`, {
        method: 'POST',
        body: { uploadId, parts: batch },
      }).then((r) => {
        if (r.status !== 200) throw new UploadError(message(r.data, `Couldn’t continue the upload (${r.status}).`));
        return r.data.urls;
      });
      for (const n of batch) {
        const url = asked.then((u) => u[String(n)]!);
        url.catch(() => {}); // seen by the part that awaits it; the others mustn't report it unhandled
        urls.set(n, url);
      }
      // A failed request is asked again next time.
      asked.catch(() => batch.forEach((n) => urls.delete(n)));
    }
    return urls.get(part)!;
  }

  let sent = 0;
  async function send(part: number) {
    const body = file.slice((part - 1) * partSize, Math.min(file.size, part * partSize));
    for (let attempt = 1; ; attempt++) {
      if (signal?.aborted) throw cancelled();
      let res: Response | null = null;
      try {
        res = await put(await urlFor(part), { method: 'PUT', body, signal });
      } catch (e) {
        if (signal?.aborted) throw cancelled();
        if (e instanceof UploadError) throw e; // our server said no: trying again won't help
      }
      if (res?.ok) break;
      if (res && res.status < 500 && !RETRY.includes(res.status)) {
        throw new UploadError(`The storage refused part ${part} (${res.status}). Try again.`);
      }
      if (attempt >= TRIES) throw new UploadError('The upload kept failing. Check the connection and try again.');
      urls.delete(part); // a fresh URL next time, in case this one expired (403)
      await wait(1000 * 2 ** (attempt - 1), signal);
    }
    sent += body.size;
    onProgress?.({ sent, total: file.size });
  }

  try {
    let next = 1;
    onProgress?.({ sent: 0, total: file.size });
    await Promise.all(
      Array.from({ length: Math.min(PARALLEL, parts) }, async () => {
        while (next <= parts) await send(next++);
      }),
    );
  } catch (e) {
    void api(base, { method: 'DELETE', body: { uploadId } });
    throw e instanceof UploadError ? e : new UploadError('The upload was interrupted. Try again.');
  }

  const done = await api<UploadedMedia & { error?: string }>(base, {
    method: 'POST',
    body: { kind: 'app', name: file.name, size: file.size, uploadId },
  });
  if (done.status !== 200 && done.status !== 201) {
    throw new UploadError(message(done.data, `The upload couldn’t be checked (${done.status}).`));
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
