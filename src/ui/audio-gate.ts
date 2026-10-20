import { useSyncExternalStore } from 'react';

/**
 * Whether this page may play sound yet. After every fresh load (a new tab, a refresh, a visit on
 * another day) browsers keep a page silent until the visitor clicks, taps or presses a key on it;
 * pointing at something doesn't count. A sound played before then is lost, and a sound engine
 * (AudioContext) started then stays suspended: that is why sound that was on sometimes didn't come
 * on. navigator.userActivation answers directly (Chrome, Firefox 120+, Safari 16.4+); elsewhere the
 * first such input on the page stands in for it.
 */
const INPUTS = ['pointerdown', 'mousedown', 'touchend', 'keydown'] as const;
let seenInput = false;
const listeners = new Set<() => void>();

export function audioAllowed(): boolean {
  if (typeof navigator === 'undefined') return false;
  const activation = (navigator as { userActivation?: UserActivation }).userActivation;
  return activation ? activation.hasBeenActive : seenInput;
}

const listen = (on: boolean) =>
  INPUTS.forEach((t) =>
    on ? window.addEventListener(t, onInput, true) : window.removeEventListener(t, onInput, true),
  );

function onInput(e: Event) {
  // Browsers don't count Escape.
  if (e.type === 'keydown' && (e as KeyboardEvent).key === 'Escape') return;
  seenInput = true;
  if (!audioAllowed()) return;
  listen(false);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // On window, capturing: this runs before any page handler of the same input.
  if (!audioAllowed()) listen(true);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) listen(false);
  };
}

/** False on the server; in the browser, true from the visitor's first click, tap or key press. */
export const useAudioAllowed = () => useSyncExternalStore(subscribe, audioAllowed, () => false);
