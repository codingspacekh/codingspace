import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeMath } from '../patches/safe-math.mjs';

// Arwes frame dimensions after % substitution, e.g. "100% - 10" with size 200 → "200 - 10".
test('evaluates the arithmetic Arwes frames use', () => {
  assert.equal(safeMath('200 - 10'), 190);
  assert.equal(safeMath('100'), 100);
  assert.equal(safeMath('-8'), -8);
  assert.equal(safeMath('(200 - 8) / 2'), 96);
  assert.equal(safeMath('2 + 3 * 4'), 14);
  assert.equal(safeMath('(2 + 3) * 4'), 20);
  assert.equal(safeMath('7 % 4'), 3);
  assert.equal(safeMath('10 - -2'), 12);
  assert.equal(safeMath('0.5 * 3'), 1.5);
  assert.equal(safeMath('  12.25+0.75 '), 13);
});

test('rejects anything that is not plain arithmetic', () => {
  for (const bad of ['alert(1)', '1;2', '2 ** 3', '()', '1 +', '(1 + 2', '1 2', 'constructor', '', '1/0x1']) {
    assert.throws(() => safeMath(bad), undefined, `should reject: ${bad}`);
  }
});

test('patched Arwes files contain no eval', () => {
  for (const f of ['esm', 'cjs']) {
    const src = readFileSync(`node_modules/@arwes/frames/build/${f}/internal/formatFrameDimension.js`, 'utf8');
    assert.ok(!/\beval\s*\(/.test(src), `${f} build still calls eval`);
    assert.match(src, /CODINGSPACE-PATCH safe-math/);
  }
});
