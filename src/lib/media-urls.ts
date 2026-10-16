import { MEDIA_BASE_URL } from '@/config/content-origins.mjs';

/**
 * Where uploaded media live in R2 (03 ADM-10). Content stores only the media id (and an
 * image's variant widths), never a full URL, so moving from the temporary r2.dev address
 * to files.codingspace.io needs no content changes: only a rebuild and a re-publish.
 *
 *   i/<id>/<width>.webp, i/<id>/<width>.avif   image variants (EXIF stripped)
 *   f/<id>                                     files, served as downloads
 */

export const IMAGE_FORMATS = ['avif', 'webp'] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isMediaId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/** Variant widths as stored: 1–4 ascending whole numbers. Anything else is null. */
export function mediaWidths(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > 4) return null;
  if (!v.every((w, i) => Number.isInteger(w) && w >= 1 && w <= 20000 && (i === 0 || w > v[i - 1]))) return null;
  return v as number[];
}

export const imageKey = (id: string, width: number, format: ImageFormat) => `i/${id}/${width}.${format}`;
export const fileKey = (id: string) => `f/${id}`;
/** Where an upload waits until the server has checked and processed it. */
export const uploadKey = (id: string) => `u/${id}`;

export const mediaUrl = (key: string) => `${MEDIA_BASE_URL}/${key}`;

/** The width used for `src`: the largest variant up to 960 px (the article column is 720). */
export function fallbackWidth(widths: number[]): number {
  return [...widths].reverse().find((w) => w <= 960) ?? widths[0]!;
}

export function srcset(id: string, widths: number[], format: ImageFormat): string {
  return widths.map((w) => `${mediaUrl(imageKey(id, w, format))} ${w}w`).join(', ');
}
