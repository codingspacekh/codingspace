/**
 * Evaluates plain arithmetic: numbers, + - * / %, unary +/-, parentheses.
 * Replaces the eval() inside @arwes/frames so the site can keep a CSP without 'unsafe-eval'.
 * Self-contained on purpose: its source is injected into node_modules by apply-arwes-patch.mjs.
 */
export function safeMath(input) {
  const src = String(input);
  let i = 0;
  const fail = (msg) => {
    throw new Error(`safeMath: ${msg} in "${src}"`);
  };
  const skip = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };
  const peek = () => {
    skip();
    return src[i];
  };
  function number() {
    skip();
    const m = /^(\d+\.?\d*|\.\d+)/.exec(src.slice(i));
    if (!m) fail(`expected a number at ${i}`);
    i += m[0].length;
    return Number(m[0]);
  }
  function factor() {
    const c = peek();
    if (c === '+' || c === '-') {
      i++;
      const v = factor();
      return c === '-' ? -v : v;
    }
    if (c === '(') {
      i++;
      const v = expr();
      if (peek() !== ')') fail('missing )');
      i++;
      return v;
    }
    return number();
  }
  function term() {
    let v = factor();
    for (;;) {
      const c = peek();
      if (c !== '*' && c !== '/' && c !== '%') return v;
      i++;
      if (src[i] === '*') fail('** is not allowed');
      const r = factor();
      v = c === '*' ? v * r : c === '/' ? v / r : v % r;
    }
  }
  function expr() {
    let v = term();
    for (;;) {
      const c = peek();
      if (c !== '+' && c !== '-') return v;
      i++;
      const r = term();
      v = c === '+' ? v + r : v - r;
    }
  }
  if (!src.trim()) fail('empty expression');
  const value = expr();
  if (peek() !== undefined) fail(`unexpected "${src[i]}" at ${i}`);
  return value;
}
