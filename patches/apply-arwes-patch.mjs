// Runs on postinstall. Replaces eval() in @arwes/frames with safeMath (see safe-math.mjs).
// Idempotent, and fails loudly if Arwes ever changes the file, so a version bump can't silently undo the patch.
import { readFileSync, writeFileSync } from 'node:fs';
import { safeMath } from './safe-math.mjs';

const MARK = '/* CODINGSPACE-PATCH safe-math */';
const ORIGINAL = 'return String(eval(formula));';
const REPLACEMENT = 'return String(safeMath(formula));';

for (const format of ['esm', 'cjs']) {
  const file = new URL(
    `../node_modules/@arwes/frames/build/${format}/internal/formatFrameDimension.js`,
    import.meta.url,
  );
  const src = readFileSync(file, 'utf8');
  if (src.includes(MARK)) continue;
  if (!src.includes(ORIGINAL)) {
    console.error(
      `[arwes-patch] Unexpected content in ${format} formatFrameDimension.js. Review the patch for this Arwes version.`,
    );
    process.exit(1);
  }
  const patched = `${MARK}\n${safeMath.toString()}\n${src.replace(ORIGINAL, REPLACEMENT)}`;
  writeFileSync(file, patched);
  console.log(`[arwes-patch] patched ${format}`);
}
