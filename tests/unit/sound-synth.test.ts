// @vitest-environment node
import { ALTERNATIVES, RATE, SOUNDS, random, wav } from '../../scripts/sound-synth.mjs';

// Our own interface sounds (no third-party audio): they must be valid, short, and never clip.
describe('synthesised interface sounds', () => {
  it.each(Object.entries({ ...SOUNDS, ...ALTERNATIVES }))('%s is short, loud enough and never clips', (_, make) => {
    const samples = make();
    const seconds = samples.length / RATE;
    expect(seconds).toBeGreaterThan(0.02);
    expect(seconds).toBeLessThan(1.6);
    let peak = 0;
    for (const v of samples) {
      expect(Number.isFinite(v)).toBe(true);
      peak = Math.max(peak, Math.abs(v));
    }
    expect(peak).toBeGreaterThan(0.2);
    expect(peak).toBeLessThanOrEqual(0.81);
    // Fades out: no click at the end.
    expect(Math.abs(samples[samples.length - 1]!)).toBeLessThan(0.01);
  });

  it('is the same every time (deterministic)', () => {
    expect(ALTERNATIVES.typing()).toEqual(ALTERNATIVES.typing());
    const a = random(1);
    const b = random(1);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('writes 16-bit mono PCM WAV', () => {
    const file = wav(new Float32Array([0, 0.5, -0.5, 1.5]));
    expect(file.toString('ascii', 0, 4)).toBe('RIFF');
    expect(file.toString('ascii', 8, 12)).toBe('WAVE');
    expect(file.readUInt16LE(22)).toBe(1); // mono
    expect(file.readUInt32LE(24)).toBe(RATE);
    expect(file.readUInt16LE(34)).toBe(16);
    expect(file.readUInt32LE(40)).toBe(8);
    expect(file.readInt16LE(44 + 6)).toBe(32767); // clipped, not wrapped
  });
});
