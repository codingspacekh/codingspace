// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zip } from '@/server/export/zip';
import { unzip } from '@/server/export/unzip';

const hasUnzip = (() => {
  try {
    execFileSync('unzip', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('zip', () => {
  const entries = [
    { path: 'content.json', data: JSON.stringify({ a: 1 }) },
    { path: 'posts/life/ការសិក្សា.md', data: '# សួស្តី\n' },
    { path: 'empty.txt', data: '' },
    { path: 'big.txt', data: 'x'.repeat(100_000) },
  ];

  it('stores every file, with UTF-8 names, and reads back intact', () => {
    const files = unzip(zip(entries, new Date('2026-10-17T09:30:00Z')));
    expect([...files.keys()]).toEqual(entries.map((e) => e.path));
    for (const e of entries) expect(files.get(e.path)).toBe(e.data);
  });

  it('compresses', () => {
    expect(zip(entries).length).toBeLessThan(10_000);
  });

  it.skipIf(!hasUnzip)('passes a standard unzip test', () => {
    const dir = mkdtempSync(join(tmpdir(), 'zip-test-'));
    try {
      writeFileSync(join(dir, 'a.zip'), zip(entries));
      expect(execFileSync('unzip', ['-t', join(dir, 'a.zip')], { encoding: 'utf8' })).toContain('No errors detected');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
