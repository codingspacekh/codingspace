// @vitest-environment node
import sharp from 'sharp';
import { classifyUpload, type UploadType } from '@/lib/media-rules';
import { checkApp, checkContent, sniffImage } from '@/server/media/sniff';

const type = (kind: 'image' | 'file', name: string): UploadType => {
  const out = classifyUpload(kind, name, 1);
  if (!out.ok) throw new Error(out.error);
  return out.type;
};
const bytes = (...parts: (string | number[])[]) =>
  Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'latin1') : Buffer.from(p))));

describe('magic bytes (03 §8.4)', () => {
  it.each(['jpeg', 'png', 'gif', 'webp', 'avif'] as const)('recognises a real %s', async (format) => {
    const blank = sharp({ create: { width: 8, height: 8, channels: 3, background: '#123456' } });
    const img = await blank[format]().toBuffer();
    expect(sniffImage(img)).toBe(`image/${format}`);
    expect(checkContent(type('image', `a.${format === 'jpeg' ? 'jpg' : format}`), img)).toBeNull();
  });

  it('accepts a PNG named .jpg (it is re-encoded anyway)', async () => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
    expect(checkContent(type('image', 'a.jpg'), png)).toBeNull();
  });

  it.each([
    ['SVG renamed to .png', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'],
    ['HTML renamed to .png', '<!doctype html><script>alert(1)</script>'],
    ['a Windows program renamed to .png', 'MZ\x90\x00\x03'],
    ['an empty-looking header', '\x00\x00\x00\x00'],
  ])('refuses %s', (_, content) => {
    expect(checkContent(type('image', 'a.png'), bytes(content))).toMatch(/doesn’t look like a PNG image/);
  });

  it('refuses an empty upload', () => {
    expect(checkContent(type('file', 'a.pdf'), new Uint8Array())).toBe('The file is empty.');
  });

  it.each([
    ['a.pdf', bytes('%PDF-1.7\n...')],
    ['a.docx', bytes([0x50, 0x4b, 0x03, 0x04], 'rest')],
    ['a.zip', bytes([0x50, 0x4b, 0x03, 0x04])],
    ['a.doc', bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
    ['a.txt', Buffer.from('Hello, ជំរាបសួរ\n', 'utf8')],
    ['a.py', Buffer.from('print("hi")\n', 'utf8')],
    ['a.ipynb', Buffer.from('{"cells": []}', 'utf8')],
  ])('accepts %s with the right content', (name, content) => {
    expect(checkContent(type('file', name), content)).toBeNull();
  });

  it.each([
    ['a.pdf', bytes('<html>not a pdf')],
    ['a.docx', bytes('%PDF-1.4')],
    ['a.xls', bytes([0x50, 0x4b, 0x03, 0x04])],
    ['a.txt', bytes([0x4d, 0x5a, 0x00, 0x01])],
    ['a.csv', bytes([0xff, 0xfe, 0x41, 0x00])],
  ])('refuses %s whose content is something else', (name, content) => {
    expect(checkContent(type('file', name), content)).toMatch(/doesn’t look like/);
  });
});

describe('app downloads: first and last bytes (2026-10-20)', () => {
  const app = (name: string): UploadType => {
    const out = classifyUpload('app', name, 1);
    if (!out.ok) throw new Error(out.error);
    return out.type;
  };
  const koly = bytes('koly', new Array(508).fill(0));

  it.each([
    ['setup.exe', bytes('MZ\x90\x00'), new Uint8Array()],
    ['setup.msi', bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), new Uint8Array()],
    ['app.zip', bytes('PK\x03\x04'), new Uint8Array()],
    ['app.apk', bytes('PK\x03\x04'), new Uint8Array()],
    ['app.pkg', bytes('xar!'), new Uint8Array()],
    ['app.dmg', bytes([0x78, 0x01]), koly],
  ])('accepts a real %s', (name, head, tail) => {
    expect(checkApp(app(name), head, tail)).toBeNull();
  });

  it.each([
    ['a script renamed to .exe', 'setup.exe', bytes('#!/bin/sh'), new Uint8Array()],
    ['a ZIP renamed to .msi', 'setup.msi', bytes('PK\x03\x04'), new Uint8Array()],
    ['a program renamed to .zip', 'app.zip', bytes('MZ'), new Uint8Array()],
    ['a disk image without its trailer', 'app.dmg', bytes('koly'), bytes('x'.repeat(512))],
    ['a disk image cut short', 'app.dmg', bytes('x'), bytes('koly')],
  ])('refuses %s', (_, name, head, tail) => {
    expect(checkApp(app(name), head, tail)).toMatch(/doesn’t look like/);
  });

  it('refuses an empty file', () => {
    expect(checkApp(app('a.exe'), new Uint8Array(), new Uint8Array())).toBe('The file is empty.');
  });
});
