import { createHash } from 'node:crypto';

/**
 * Reads a stored file once, front to back, without holding it in memory (an app download can
 * be 2 GB): its SHA-256, its size, and its first and last bytes for the type check.
 */

export const HEAD_BYTES = 4096;
export const TAIL_BYTES = 512;

export type Inspected = { sha256: string; bytes: number; head: Uint8Array; tail: Uint8Array };

export async function inspect(chunks: AsyncIterable<Uint8Array>): Promise<Inspected> {
  const hash = createHash('sha256');
  let bytes = 0;
  let head: Uint8Array = new Uint8Array(0);
  let tail: Uint8Array = new Uint8Array(0);
  for await (const chunk of chunks) {
    hash.update(chunk);
    bytes += chunk.length;
    if (head.length < HEAD_BYTES) head = join(head, chunk.subarray(0, HEAD_BYTES - head.length));
    tail = (chunk.length >= TAIL_BYTES ? chunk : join(tail, chunk)).slice(-TAIL_BYTES);
  }
  return { sha256: hash.digest('hex'), bytes, head, tail };
}

function join(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}
