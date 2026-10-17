import { crc32, inflateRawSync } from 'node:zlib';

/** Reads a ZIP made by ./zip.ts back through its central directory, checking every CRC. */
export function unzip(file: Buffer): Map<string, string> {
  const end = file.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error('no end of central directory');
  const count = file.readUInt16LE(end + 10);
  let at = file.readUInt32LE(end + 16);
  const out = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    if (file.readUInt32LE(at) !== 0x02014b50) throw new Error('bad central header');
    const crc = file.readUInt32LE(at + 16);
    const packedSize = file.readUInt32LE(at + 20);
    const nameLength = file.readUInt16LE(at + 28);
    const extra = file.readUInt16LE(at + 30) + file.readUInt16LE(at + 32);
    const local = file.readUInt32LE(at + 42);
    const name = file.toString('utf8', at + 46, at + 46 + nameLength);
    const dataAt = local + 30 + file.readUInt16LE(local + 26) + file.readUInt16LE(local + 28);
    const data = inflateRawSync(file.subarray(dataAt, dataAt + packedSize));
    if (crc32(data) !== crc) throw new Error(`CRC mismatch in ${name}`);
    out.set(name, data.toString('utf8'));
    at += 46 + nameLength + extra;
  }
  return out;
}
