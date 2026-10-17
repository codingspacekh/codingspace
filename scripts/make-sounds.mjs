// Writes CodingSpace's own interface sounds to public/sounds/ (scripts/sound-synth.mjs):
// the hover tick, the page-leave whoosh and the click. The others are ARWES's (public/sounds/LICENSE-arwes.txt).
// Run after changing a sound: node scripts/make-sounds.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOUNDS, wav } from './sound-synth.mjs';

const dir = join(process.cwd(), 'public/sounds');
mkdirSync(dir, { recursive: true });
for (const [name, make] of Object.entries(SOUNDS)) {
  const file = wav(make());
  writeFileSync(join(dir, `${name}.wav`), file);
  console.log(`${name}.wav`.padEnd(16), `${(file.length / 1024).toFixed(1)} KB`);
}
