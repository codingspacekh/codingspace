// @vitest-environment node
import { createHash } from 'node:crypto';
import { HEAD_BYTES, inspect, TAIL_BYTES } from '@/server/media/inspect';

async function* chunked(data: Uint8Array, size: number) {
  for (let i = 0; i < data.length; i += size) yield data.subarray(i, i + size);
}

describe('reading a big file once (2026-10-20)', () => {
  const data = Uint8Array.from({ length: 10_000 }, (_, i) => (i * 7) % 251);
  const sha = createHash('sha256').update(data).digest('hex');

  it.each([1, 100, 511, 512, 4096, 20_000])('gets the hash, size, head and tail in chunks of %i', async (size) => {
    const out = await inspect(chunked(data, size));
    expect(out.sha256).toBe(sha);
    expect(out.bytes).toBe(data.length);
    expect(out.head).toEqual(data.subarray(0, HEAD_BYTES));
    expect(out.tail).toEqual(data.subarray(data.length - TAIL_BYTES));
  });

  it('copes with a file smaller than the head and tail', async () => {
    const small = new Uint8Array([1, 2, 3]);
    const out = await inspect(chunked(small, 2));
    expect([out.bytes, Array.from(out.head), Array.from(out.tail)]).toEqual([3, [1, 2, 3], [1, 2, 3]]);
  });
});
