import { test, expect } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

// NFR-PERF-2: first-load JS budget (gzipped). Results are written for the ADR.
const BUDGET_KB: Record<string, number> = { '/': 260, '/lesson': 200 };
const results: Record<string, { scripts: number; jsGzipKB: number; budgetKB: number }> = {};

for (const [path, budget] of Object.entries(BUDGET_KB)) {
  test(`${path} first-load JS is within ${budget} KB gzipped`, async ({ request }) => {
    const html = await (await request.get(path)).text();
    const srcs = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => m[1]);
    let bytes = 0;
    for (const src of srcs) bytes += gzipSync(await (await request.get(src)).body()).length;
    const kb = Math.round(bytes / 1024);
    results[path] = { scripts: srcs.length, jsGzipKB: kb, budgetKB: budget };
    mkdirSync('test-results', { recursive: true });
    writeFileSync(`test-results/budget${path === '/' ? '-home' : path.replace(/\//g, '-')}.json`, JSON.stringify(results[path], null, 2));
    expect(kb, `first-load JS ${kb} KB`).toBeLessThanOrEqual(budget);
  });
}
