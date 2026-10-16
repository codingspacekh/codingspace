// Writes the site's interface sounds to public/sounds/ (see scripts/sound-synth.mjs).
// Run after changing a sound: node scripts/make-sounds.mjs
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOUNDS, wav } from './sound-synth.mjs';

const dir = join(process.cwd(), 'public/sounds');
mkdirSync(dir, { recursive: true });
// The M1 placeholder, replaced by "deploy".
rmSync(join(dir, 'assemble.wav'), { force: true });
for (const [name, make] of Object.entries(SOUNDS)) {
  const file = wav(make());
  writeFileSync(join(dir, `${name}.wav`), file);
  console.log(`${name}.wav`.padEnd(16), `${(file.length / 1024).toFixed(1)} KB`);
}
