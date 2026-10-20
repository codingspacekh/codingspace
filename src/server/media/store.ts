import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { dirname, join, resolve } from 'node:path';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MEDIA_BASE_URL, r2Endpoint } from '@/config/content-origins.mjs';

/**
 * Where uploads are kept (D5): Cloudflare R2 in production, a folder on this machine for
 * local runs and E2E tests (MEDIA_STORE=local). Only the server talks to the store, except
 * for the browser's upload, which goes straight to it with a presigned PUT (03 §8.4).
 */

export type PutOptions = { contentType: string; cacheControl: string; contentDisposition?: string };

export interface MediaStore {
  /** A URL the browser can PUT exactly this many bytes of this type to, for `expiresIn` seconds. */
  presignPut(key: string, o: { contentType: string; contentLength: number; expiresIn: number }): Promise<string>;
  head(key: string): Promise<{ size: number } | null>;
  get(key: string): Promise<Uint8Array>;
  put(key: string, body: Uint8Array, o: PutOptions): Promise<void>;
  delete(keys: string[]): Promise<void>;

  // Big files (app downloads, up to 2 GB) go up in parts, straight to their final key; the
  // object exists only once the server completes the upload (src/server/media/app-uploads.ts).
  /** Starts an upload in parts; returns its upload id. The headers are the object's. */
  createMultipart(key: string, o: PutOptions): Promise<string>;
  /** A URL the browser can PUT part `part` (1, 2, …) to, for `expiresIn` seconds. */
  presignPart(key: string, uploadId: string, part: number, expiresIn: number): Promise<string>;
  /** Joins parts 1…`parts` into the object. False (and nothing joined) when any is missing or extra. */
  completeMultipart(key: string, uploadId: string, parts: number): Promise<boolean>;
  abortMultipart(key: string, uploadId: string): Promise<void>;
  /** The object's bytes, read front to back without holding them all. */
  stream(key: string): AsyncIterable<Uint8Array>;
}

/** Parts 1…n, each exactly once? */
const isRun = (numbers: number[], n: number) =>
  numbers.length === n && [...numbers].sort((a, b) => a - b).every((v, i) => v === i + 1);

export const IMMUTABLE = 'public, max-age=31536000, immutable';

// ── R2 (S3 API) ─────────────────────────────────────────────────────────────

export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };

export function r2Store(config: R2Config, client?: Pick<S3Client, 'send'>): MediaStore {
  const s3 =
    client ??
    new S3Client({
      region: 'auto',
      endpoint: r2Endpoint(config.accountId)!,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      // <account>.r2.cloudflarestorage.com/<bucket>/<key>: the one origin the CSP allows (connect-src).
      forcePathStyle: true,
      // Newer SDKs add CRC32 checksums by default; a presigned URL carrying one only works
      // for an empty body, and R2 doesn't need them.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  const Bucket = config.bucket;
  return {
    presignPut(key, { contentType, contentLength, expiresIn }) {
      // Type and length are signed: R2 refuses a PUT with any other Content-Type or size.
      return getSignedUrl(
        s3 as S3Client,
        new PutObjectCommand({ Bucket, Key: key, ContentType: contentType, ContentLength: contentLength }),
        { expiresIn, signableHeaders: new Set(['content-type', 'content-length']) },
      );
    },
    async head(key) {
      try {
        const out = await s3.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { size: out.ContentLength ?? 0 };
      } catch (e) {
        if (e instanceof S3ServiceException && e.$metadata.httpStatusCode === 404) return null;
        throw e;
      }
    },
    async get(key) {
      const out = await s3.send(new GetObjectCommand({ Bucket, Key: key }));
      if (!out.Body) throw new Error(`R2 returned no body for ${key}`);
      return out.Body.transformToByteArray();
    },
    async put(key, body, o) {
      await s3.send(
        new PutObjectCommand({
          Bucket,
          Key: key,
          Body: body,
          ContentType: o.contentType,
          CacheControl: o.cacheControl,
          ContentDisposition: o.contentDisposition,
        }),
      );
    },
    async delete(keys) {
      // One request per key: DeleteObjects needs a checksum header R2 handles differently.
      await Promise.all(keys.map((Key) => s3.send(new DeleteObjectCommand({ Bucket, Key }))));
    },
    async createMultipart(key, o) {
      const out = await s3.send(
        new CreateMultipartUploadCommand({
          Bucket,
          Key: key,
          ContentType: o.contentType,
          CacheControl: o.cacheControl,
          ContentDisposition: o.contentDisposition,
        }),
      );
      if (!out.UploadId) throw new Error(`R2 returned no upload id for ${key}`);
      return out.UploadId;
    },
    presignPart(key, uploadId, part, expiresIn) {
      return getSignedUrl(
        s3 as S3Client,
        new UploadPartCommand({ Bucket, Key: key, UploadId: uploadId, PartNumber: part }),
        {
          expiresIn,
        },
      );
    },
    async completeMultipart(key, uploadId, parts) {
      // The server asks R2 which parts arrived (and their ETags), so the browser never has to
      // read response headers (R2's CORS would have to expose ETag).
      const found: { PartNumber: number; ETag: string }[] = [];
      let marker: string | undefined;
      try {
        do {
          const out = await s3.send(
            new ListPartsCommand({ Bucket, Key: key, UploadId: uploadId, PartNumberMarker: marker }),
          );
          for (const p of out.Parts ?? []) found.push({ PartNumber: p.PartNumber!, ETag: p.ETag! });
          marker = out.IsTruncated ? out.NextPartNumberMarker : undefined;
        } while (marker);
      } catch (e) {
        if (e instanceof S3ServiceException && e.$metadata.httpStatusCode === 404) return false;
        throw e;
      }
      if (
        !isRun(
          found.map((p) => p.PartNumber),
          parts,
        )
      )
        return false;
      found.sort((a, b) => a.PartNumber - b.PartNumber);
      await s3.send(
        new CompleteMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: found } }),
      );
      return true;
    },
    async abortMultipart(key, uploadId) {
      try {
        await s3.send(new AbortMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId }));
      } catch (e) {
        if (!(e instanceof S3ServiceException && e.$metadata.httpStatusCode === 404)) throw e;
      }
    },
    async *stream(key) {
      const out = await s3.send(new GetObjectCommand({ Bucket, Key: key }));
      if (!out.Body) throw new Error(`R2 returned no body for ${key}`);
      yield* out.Body as unknown as AsyncIterable<Uint8Array>;
    },
  };
}

// ── Local folder (development and E2E only) ─────────────────────────────────

/** Keys the app creates (src/lib/media-urls.ts). Anything else is refused, so no path tricks. */
const KEY = /^(u|f|i)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/\d{1,5}\.(webp|avif))?$/;
export const isStoreKey = (key: string) => KEY.test(key);

type LocalMeta = PutOptions;

const UPLOAD_ID = /^[0-9a-f]{32}$/;

export type LocalStore = MediaStore & {
  read(key: string): Promise<{ body: Buffer; meta: LocalMeta } | null>;
  /** Checks a presigned local upload URL's query; null when it is valid for this request. */
  verifyPut(
    key: string,
    query: Record<string, string | string[] | undefined>,
    contentType: string,
    length: number,
  ): string | null;
  write(key: string, body: Uint8Array, meta: LocalMeta): Promise<void>;
  /** Checks a presigned local part URL's query; null when it is valid for this key. */
  verifyPart(key: string, query: Record<string, string | string[] | undefined>): string | null;
  /** Stores one part of an upload started for this key; false if there is no such upload. */
  writePart(key: string, uploadId: string, part: number, body: Uint8Array): Promise<boolean>;
};

export function localStore(root: string, secret: string, now = () => Date.now()): LocalStore {
  const base = resolve(root);
  const path = (key: string) => {
    if (!isStoreKey(key)) throw new Error(`bad media key: ${key}`);
    return join(base, key);
  };
  const sign = (key: string, expires: number, type: string, length: number) =>
    createHmac('sha256', secret).update(`${key}\n${expires}\n${type}\n${length}`).digest('hex');

  const signPart = (key: string, uploadId: string, part: number, expires: number) =>
    createHmac('sha256', secret).update(`part\n${key}\n${uploadId}\n${part}\n${expires}`).digest('hex');
  /** An upload's parts wait in parts/<upload id>/, with upload.json naming its key and headers. */
  const partsDir = (uploadId: string) => {
    if (!UPLOAD_ID.test(uploadId)) throw new Error(`bad upload id: ${uploadId}`);
    return join(base, 'parts', uploadId);
  };
  const upload = async (key: string, uploadId: string): Promise<LocalMeta | null> => {
    try {
      const saved = JSON.parse(await readFile(join(partsDir(uploadId), 'upload.json'), 'utf8')) as {
        key: string;
        meta: LocalMeta;
      };
      return saved.key === key ? saved.meta : null;
    } catch {
      return null;
    }
  };

  const write = async (key: string, body: Uint8Array, meta: LocalMeta) => {
    const file = path(key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, body);
    await writeFile(`${file}.meta.json`, JSON.stringify(meta));
  };

  return {
    async presignPut(key, { contentType, contentLength, expiresIn }) {
      path(key);
      const expires = Math.floor(now() / 1000) + expiresIn;
      const q = new URLSearchParams({
        expires: String(expires),
        type: contentType,
        length: String(contentLength),
        sig: sign(key, expires, contentType, contentLength),
      });
      return `${MEDIA_BASE_URL}/${key}?${q}`;
    },
    verifyPut(key, query, contentType, length) {
      const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
      const expires = Number(one(query.expires));
      const expected = sign(key, expires, one(query.type), Number(one(query.length)));
      const given = Buffer.from(one(query.sig), 'hex');
      if (!isStoreKey(key) || given.length !== 32 || !timingSafeEqual(given, Buffer.from(expected, 'hex'))) {
        return 'bad signature';
      }
      if (!(expires * 1000 > now())) return 'expired';
      if (contentType !== one(query.type)) return 'content type differs from the signed one';
      if (length !== Number(one(query.length))) return 'length differs from the signed one';
      return null;
    },
    write,
    async read(key) {
      try {
        const file = path(key);
        const [body, meta] = await Promise.all([readFile(file), readFile(`${file}.meta.json`, 'utf8')]);
        return { body, meta: JSON.parse(meta) as LocalMeta };
      } catch {
        return null;
      }
    },
    async head(key) {
      try {
        return { size: (await stat(path(key))).size };
      } catch {
        return null;
      }
    },
    async get(key) {
      return new Uint8Array(await readFile(path(key)));
    },
    put: write,
    async delete(keys) {
      await Promise.all(
        keys.flatMap((k) => [rm(path(k), { force: true }), rm(`${path(k)}.meta.json`, { force: true })]),
      );
    },
    async createMultipart(key, o) {
      path(key);
      const uploadId = randomBytes(16).toString('hex');
      await mkdir(partsDir(uploadId), { recursive: true });
      await writeFile(join(partsDir(uploadId), 'upload.json'), JSON.stringify({ key, meta: o }));
      return uploadId;
    },
    async presignPart(key, uploadId, part, expiresIn) {
      path(key);
      partsDir(uploadId);
      const expires = Math.floor(now() / 1000) + expiresIn;
      const q = new URLSearchParams({
        uploadId,
        partNumber: String(part),
        expires: String(expires),
        sig: signPart(key, uploadId, part, expires),
      });
      return `${MEDIA_BASE_URL}/${key}?${q}`;
    },
    verifyPart(key, query) {
      const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
      const uploadId = one(query.uploadId);
      const part = Number(one(query.partNumber));
      const expires = Number(one(query.expires));
      const given = Buffer.from(one(query.sig), 'hex');
      if (!isStoreKey(key) || !UPLOAD_ID.test(uploadId) || !Number.isInteger(part) || part < 1 || part > 10000) {
        return 'bad signature';
      }
      const expected = Buffer.from(signPart(key, uploadId, part, expires), 'hex');
      if (given.length !== 32 || !timingSafeEqual(given, expected)) return 'bad signature';
      if (!(expires * 1000 > now())) return 'expired';
      return null;
    },
    async writePart(key, uploadId, part, body) {
      if (!(await upload(key, uploadId))) return false;
      await writeFile(join(partsDir(uploadId), String(part)), body);
      return true;
    },
    async completeMultipart(key, uploadId, parts) {
      const meta = await upload(key, uploadId);
      if (!meta) return false;
      const dir = partsDir(uploadId);
      const numbers = (await readdir(dir)).filter((f) => /^\d+$/.test(f)).map(Number);
      if (!isRun(numbers, parts)) return false;
      const file = path(key);
      await mkdir(dirname(file), { recursive: true });
      const out = createWriteStream(file);
      for (let n = 1; n <= parts; n++) await pipeline(createReadStream(join(dir, String(n))), out, { end: false });
      await new Promise<void>((done, fail) => out.end((e?: Error | null) => (e ? fail(e) : done())));
      await writeFile(`${file}.meta.json`, JSON.stringify(meta));
      await rm(dir, { recursive: true, force: true });
      return true;
    },
    async abortMultipart(_key, uploadId) {
      await rm(partsDir(uploadId), { recursive: true, force: true });
    },
    async *stream(key) {
      yield* createReadStream(path(key)) as AsyncIterable<Uint8Array>;
    },
  };
}

// ── Which store this deployment uses ────────────────────────────────────────

/**
 * R2 when its four settings are present; the local folder with MEDIA_STORE=local (never on
 * Vercel); otherwise null, and uploads answer 503 until the owner adds the settings.
 */
export function mediaStore(env: NodeJS.ProcessEnv = process.env): MediaStore | null {
  if (env.MEDIA_STORE === 'local') return localMediaStore(env);
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = env;
  if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET) {
    return r2Store({
      accountId: R2_ACCOUNT_ID,
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      bucket: R2_BUCKET,
    });
  }
  return null;
}

export function localMediaStore(env: NodeJS.ProcessEnv = process.env): LocalStore | null {
  if (env.MEDIA_STORE !== 'local') return null;
  if (env.VERCEL) throw new Error('MEDIA_STORE=local is for this machine only, not for Vercel');
  // Nothing here is reachable from outside this machine; the secret only keeps the
  // presigned-URL checks honest, so tests exercise the same rules as R2.
  return localStore(env.MEDIA_LOCAL_DIR || '.media-local', env.MEDIA_LOCAL_SECRET || 'local-media-only');
}
