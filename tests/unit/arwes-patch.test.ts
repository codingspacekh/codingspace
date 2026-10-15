import { readFileSync } from 'node:fs';
import { safeMath } from '../../patches/safe-math.mjs';

// ADR 0001 finding 1: Arwes frames use eval(); we replace it so the CSP needs no 'unsafe-eval'.
describe('safeMath', () => {
  it.each([
    ['200 - 10', 190],
    ['100', 100],
    ['-8', -8],
    ['(200 - 8) / 2', 96],
    ['2 + 3 * 4', 14],
    ['(2 + 3) * 4', 20],
    ['7 % 4', 3],
    ['10 - -2', 12],
    ['0.5 * 3', 1.5],
    ['  12.25+0.75 ', 13],
  ])('evaluates %s', (expr, value) => {
    expect(safeMath(expr)).toBe(value);
  });

  it.each(['alert(1)', '1;2', '2 ** 3', '()', '1 +', '(1 + 2', '1 2', 'constructor', '', '1/0x1'])(
    'rejects %s',
    (bad) => {
      expect(() => safeMath(bad)).toThrow();
    },
  );
});

describe('installed Arwes', () => {
  it.each(['esm', 'cjs'])('%s build is patched and has no eval', (format) => {
    const src = readFileSync(`node_modules/@arwes/frames/build/${format}/internal/formatFrameDimension.js`, 'utf8');
    expect(src).toMatch(/CODINGSPACE-PATCH safe-math/);
    expect(src).not.toMatch(/\beval\s*\(/);
  });
});
