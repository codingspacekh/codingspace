// First-load JavaScript per page, gzipped, against NFR-PERF-2 (03): lessons ≤ 200 KB, Home ≤ 260 KB
// (it carries the orbit hero). Run after `npm run build`. Exits 1 when a page is over budget.
// Code loaded later (the orbit engine, sound, the editor) is not first-load and isn't counted.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const NEXT = join(process.cwd(), '.next');
const KB = 1024;
const BUDGETS = {
  '/': 260 * KB,
  '/posts/[slug]': 200 * KB,
  '/study/[subject]': 200 * KB,
  '/projects': 200 * KB,
  '/author': 200 * KB,
};

const manifest = JSON.parse(readFileSync(join(NEXT, 'build-manifest.json'), 'utf8'));
const shared = [
  ...(manifest.polyfillFiles ?? []),
  ...(manifest.rootMainFiles ?? []),
  ...(manifest.pages['/_app'] ?? []),
];
const gz = new Map();
const size = (file) => {
  if (!gz.has(file)) gz.set(file, gzipSync(readFileSync(join(NEXT, file))).length);
  return gz.get(file);
};

let over = false;
for (const [page, budget] of Object.entries(BUDGETS)) {
  const files = new Set([...shared, ...(manifest.pages[page] ?? [])].filter((f) => f.endsWith('.js')));
  if (!manifest.pages[page]) {
    console.error(`${page}: not in the build manifest`);
    over = true;
    continue;
  }
  const total = [...files].reduce((sum, f) => sum + size(f), 0);
  const ok = total <= budget;
  over ||= !ok;
  console.log(
    `${ok ? 'ok  ' : 'OVER'} ${page.padEnd(18)} ${(total / KB).toFixed(1).padStart(6)} KB of ${budget / KB} KB`,
  );
}
process.exit(over ? 1 : 0);
