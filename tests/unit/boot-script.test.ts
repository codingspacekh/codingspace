import { createHash } from 'node:crypto';
import { ARRIVE_MS, BOOT_SCRIPT, FIRST_LOAD_MS } from '@/config/boot-script.mjs';
import { BOOT_SCRIPT_HASH, buildCsp } from '@/config/security-headers.mjs';

// The first-load arrival (owner request 2026-10-17): skeleton, then cards fade in. It runs before
// React, so it must manage itself, and must never run for visitors who asked for no motion.
const html = document.documentElement;
const run = () => new Function(BOOT_SCRIPT)();

beforeEach(() => {
  vi.useFakeTimers();
  html.removeAttribute('data-transition');
  html.removeAttribute('data-motion');
  window.history.replaceState({}, '', '/');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('first-load arrival (boot script)', () => {
  it('shows the skeleton, then the page arrives, then it leaves the page alone', () => {
    run();
    expect(html.dataset.motion).toBe('on');
    expect(html.dataset.transition).toBe('loading');
    vi.advanceTimersByTime(FIRST_LOAD_MS);
    expect(html.dataset.transition).toBe('in');
    vi.advanceTimersByTime(ARRIVE_MS);
    expect(html.dataset.transition).toBeUndefined();
  });

  it.each([
    ['motion turned off', { motion: false }],
    ['reading mode', { reading: true }],
  ])('does nothing with %s', (_, prefs) => {
    window.localStorage.setItem('cs-prefs', JSON.stringify(prefs));
    run();
    expect(html.dataset.transition).toBeUndefined();
  });

  it('does nothing when the device asks for reduced motion (and the visitor has not chosen)', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }));
    run();
    expect(html.dataset.transition).toBeUndefined();
  });

  it('a visitor who turned motion on gets it even with reduced motion on the device', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }));
    window.localStorage.setItem('cs-prefs', JSON.stringify({ motion: true }));
    run();
    expect(html.dataset.transition).toBe('loading');
  });

  it('does nothing in the admin, and survives unreadable storage', () => {
    window.history.replaceState({}, '', '/admin/posts');
    run();
    expect(html.dataset.transition).toBeUndefined();
    window.history.replaceState({}, '', '/');
    window.localStorage.setItem('cs-prefs', '{not json');
    expect(run).not.toThrow();
    expect(html.dataset.transition).toBe('loading');
  });

  it('is allowed by its hash only: script-src has no unsafe-inline', () => {
    const hash = `'sha256-${createHash('sha256').update(BOOT_SCRIPT).digest('base64')}'`;
    expect(BOOT_SCRIPT_HASH).toBe(hash);
    const scriptSrc = buildCsp({})
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith('script-src'));
    expect(scriptSrc).toBe(`script-src 'self' ${hash}`);
  });
});
