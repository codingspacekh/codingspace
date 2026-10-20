import type { UploadType } from '@/lib/media-rules';

/**
 * Checks an upload's bytes against its declared type (03 §8.4 "server verifies magic bytes").
 * The extension decides what a file claims to be; this decides whether it is.
 */

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** The image format the bytes actually are, whatever the name says. */
export function sniffImage(
  b: Uint8Array,
): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'image/avif' | null {
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a') return 'image/gif';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'image/webp';
  if (ascii(b, 4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(b, 8, 12))) return 'image/avif';
  return null;
}

function isUtf8Text(b: Uint8Array): boolean {
  if (b.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(b);
    return true;
  } catch {
    return false;
  }
}

/** Null when the bytes are what `type` says; otherwise why not. */
export function checkContent(type: UploadType, b: Uint8Array): string | null {
  const mismatch = `This doesn’t look like a ${type.label} file (its content doesn’t match “.${type.ext}”).`;
  if (b.length === 0) return 'The file is empty.';
  if (type.kind === 'image') {
    // A PNG named .jpg is fine: the server re-encodes it anyway. An SVG or HTML named .png is not.
    return sniffImage(b) ? null : mismatch;
  }
  switch (type.ext) {
    case 'pdf':
      return ascii(b, 0, 5) === '%PDF-' ? null : mismatch;
    case 'docx':
    case 'xlsx':
    case 'pptx':
    case 'zip':
      return startsWith(b, ZIP) ? null : mismatch;
    case 'doc':
    case 'xls':
    case 'ppt':
      return startsWith(b, OLE) ? null : mismatch;
    default:
      // Text, CSV, notebooks and source code: UTF-8 text with no NUL bytes.
      if (type.mime.startsWith('text/') || type.mime === 'application/json') {
        return isUtf8Text(b) ? null : `${mismatch} Text files must be UTF-8.`;
      }
      return mismatch;
  }
}

const MZ = [0x4d, 0x5a];
const XAR = [0x78, 0x61, 0x72, 0x21];

/**
 * An app download (2026-10-20) is too big to hold in memory, so it is checked from its first
 * and last bytes, kept while the file streams past (src/server/media/inspect.ts). Null when
 * they match the type; otherwise why not.
 */
export function checkApp(type: UploadType, head: Uint8Array, tail: Uint8Array): string | null {
  const mismatch = `This doesn’t look like a ${type.label} file (its content doesn’t match “.${type.ext}”).`;
  if (head.length === 0) return 'The file is empty.';
  switch (type.ext) {
    case 'exe':
      return startsWith(head, MZ) ? null : mismatch;
    case 'msi':
      return startsWith(head, OLE) ? null : mismatch;
    case 'zip':
    case 'apk':
      return startsWith(head, ZIP) ? null : mismatch;
    case 'pkg':
      return startsWith(head, XAR) ? null : mismatch;
    case 'dmg':
      // A disk image ends with a 512-byte "koly" trailer.
      return tail.length >= 512 && ascii(tail, tail.length - 512, tail.length - 508) === 'koly' ? null : mismatch;
    default:
      return mismatch;
  }
}
