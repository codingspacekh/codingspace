/**
 * What may be uploaded (03 ADM-10, §8.4). Shared by the editor (instant feedback before
 * uploading) and the server, which checks the bytes again after the upload (magic bytes).
 * No zod here: this file is part of the editor's browser bundle.
 */

export type MediaKind = 'image' | 'file';

type Rule = { kind: MediaKind; mime: string; max: number; label: string };

const MB = 1024 * 1024;
export const MAX_IMAGE_BYTES = 15 * MB;
export const MAX_FILE_BYTES = 50 * MB;
export const MAX_TEXT_BYTES = 5 * MB;
/** Larger photos are refused rather than decoded (memory). 50 MP ≈ 8660 × 5770. */
export const MAX_IMAGE_PIXELS = 50_000_000;

const image = (mime: string, label: string): Rule => ({ kind: 'image', mime, max: MAX_IMAGE_BYTES, label });
const file = (mime: string, label: string, max = MAX_FILE_BYTES): Rule => ({ kind: 'file', mime, max, label });
const text = (mime: string, label: string): Rule => file(mime, label, MAX_TEXT_BYTES);
// Source code is always served as plain text: never as HTML or script, whatever the extension.
const code = (label: string) => text('text/plain', label);

/** By extension; the server checks the content matches (src/server/media/sniff.ts). */
export const UPLOAD_TYPES: Record<string, Rule> = {
  jpg: image('image/jpeg', 'JPEG image'),
  jpeg: image('image/jpeg', 'JPEG image'),
  png: image('image/png', 'PNG image'),
  gif: image('image/gif', 'GIF image'),
  webp: image('image/webp', 'WebP image'),
  avif: image('image/avif', 'AVIF image'),
  pdf: file('application/pdf', 'PDF'),
  docx: file('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Word document'),
  xlsx: file('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Excel workbook'),
  pptx: file('application/vnd.openxmlformats-officedocument.presentationml.presentation', 'PowerPoint'),
  doc: file('application/msword', 'Word document'),
  xls: file('application/vnd.ms-excel', 'Excel workbook'),
  ppt: file('application/vnd.ms-powerpoint', 'PowerPoint'),
  zip: file('application/zip', 'ZIP archive'),
  txt: text('text/plain', 'Text'),
  csv: text('text/csv', 'CSV'),
  md: text('text/markdown', 'Markdown'),
  json: text('application/json', 'JSON'),
  ipynb: text('application/json', 'Jupyter notebook'),
  py: code('Python'),
  java: code('Java'),
  c: code('C'),
  cpp: code('C++'),
  h: code('C header'),
  cs: code('C#'),
  vb: code('Visual Basic'),
  js: code('JavaScript'),
  ts: code('TypeScript'),
  sql: code('SQL'),
  html: code('HTML'),
  css: code('CSS'),
};

/** Refused with a reason the owner can act on. */
const REFUSED: Record<string, string> = {
  svg: 'SVG images can contain scripts, so they aren’t allowed. Export the drawing as PNG instead.',
  heic: 'HEIC photos can’t be shown in every browser. Convert to JPEG first (iPhone: Settings → Camera → Formats → Most Compatible).',
  heif: 'HEIF photos can’t be shown in every browser. Convert to JPEG first.',
  exe: 'Programs can’t be uploaded. Link to the program’s download page instead.',
};

export const extensionOf = (name: string) => /\.([a-z0-9]{1,8})$/i.exec(name.trim())?.[1]?.toLowerCase() ?? '';

export const IMAGE_ACCEPT = Object.entries(UPLOAD_TYPES)
  .filter(([, r]) => r.kind === 'image')
  .map(([ext]) => `.${ext}`)
  .join(',');
export const FILE_ACCEPT = Object.entries(UPLOAD_TYPES)
  .filter(([, r]) => r.kind === 'file')
  .map(([ext]) => `.${ext}`)
  .join(',');

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}

export type UploadType = { ext: string; mime: string; kind: MediaKind; max: number; label: string };

/** The upload's type from its name, or the reason it can't be uploaded. */
export function classifyUpload(
  kind: MediaKind,
  name: string,
  size: number,
): { ok: true; type: UploadType } | { ok: false; error: string } {
  const ext = extensionOf(name);
  if (Object.hasOwn(REFUSED, ext)) return { ok: false, error: REFUSED[ext]! };
  const rule = Object.hasOwn(UPLOAD_TYPES, ext) ? UPLOAD_TYPES[ext]! : null;
  if (!rule || rule.kind !== kind) {
    return {
      ok: false,
      error:
        kind === 'image'
          ? 'Images must be JPEG, PNG, GIF, WebP or AVIF.'
          : 'This file type isn’t allowed. Use PDF, Office, ZIP, text, CSV or source code.',
    };
  }
  if (!Number.isInteger(size) || size <= 0) return { ok: false, error: 'The file is empty.' };
  if (size > rule.max) {
    return {
      ok: false,
      error: `${rule.label} files can be at most ${formatBytes(rule.max)} (this one is ${formatBytes(size)}).`,
    };
  }
  return { ok: true, type: { ext, ...rule } };
}

// The bidi controls that make "evil<RLO>fdp.exe" look like "evilexe.pdf".
const BIDI = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/;

/**
 * The name kept in the library and offered when downloading: no folders, no control
 * characters, at most 200 characters, extension kept.
 */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = [...base]
    .filter((c) => {
      const code = c.codePointAt(0)!;
      return code >= 0x20 && !(code >= 0x7f && code <= 0x9f) && !BIDI.test(c);
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= 200) return cleaned;
  const ext = extensionOf(cleaned);
  return ext ? `${cleaned.slice(0, 199 - ext.length).trimEnd()}.${ext}` : cleaned.slice(0, 200);
}
