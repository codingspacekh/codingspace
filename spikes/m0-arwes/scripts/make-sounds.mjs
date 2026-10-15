// Generates tiny placeholder UI sounds (16-bit mono WAV) so the spike needs no third-party audio.
import { writeFileSync, mkdirSync } from 'node:fs';
const RATE = 22050;
function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.max(-1, Math.min(1, s)) * 32767, i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
function tone(ms, f0, f1, vol = 0.35, wave = 'sine') {
  const n = Math.round((RATE * ms) / 1000), out = [];
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n, f = f0 + (f1 - f0) * t; phase += (2 * Math.PI * f) / RATE;
    const v = wave === 'square' ? Math.sign(Math.sin(phase)) * 0.5 : Math.sin(phase);
    out.push(v * vol * Math.min(1, i / 60) * (1 - t) ** 2);
  }
  return out;
}
mkdirSync('public/sounds', { recursive: true });
writeFileSync('public/sounds/click.wav', wav(tone(70, 880, 1320)));
writeFileSync('public/sounds/hover.wav', wav(tone(25, 2200, 2000, 0.12, 'square')));
writeFileSync('public/sounds/assemble.wav', wav(tone(420, 220, 1100, 0.25)));
console.log('sounds written');
