// Copies KaTeX's stylesheet and fonts into public/katex/ so lesson pages with maths can load
// them from our own origin (CSP style-src/font-src 'self'), and pages without maths don't.
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const dist = join(dirname(createRequire(import.meta.url).resolve('katex/package.json')), 'dist');
const out = join(process.cwd(), 'public', 'katex');
mkdirSync(join(out, 'fonts'), { recursive: true });
// The swap build uses font-display: swap, like the site's own fonts (03 §7, item 5).
cpSync(join(dist, 'katex-swap.min.css'), join(out, 'katex.min.css'));
for (const f of readdirSync(join(dist, 'fonts'))) {
  if (f.endsWith('.woff2')) cpSync(join(dist, 'fonts', f), join(out, 'fonts', f));
}
