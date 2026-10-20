import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { ARRIVE_MS } from '@/config/boot-script.mjs';
import { usePrefs, useSound } from './arwes/prefs';
import { audioAllowed, useAudioAllowed } from './audio-gate';
import { setPref } from './prefs-store';

/**
 * The site's sound and page-change effects, after the original Arwes sites (soulextract.com):
 *
 *  - Sounds, only once the visitor turns sound on: a tick when the pointer reaches a link or
 *    button, a click when one is used, a whoosh when leaving a page, then the new page
 *    "deploys" and its heading types in.
 *  - Page changes inside the site (motion on): the old page goes with a scan line and skeleton
 *    cards shimmer in its place (at least LOADER_MS); then the new page draws its frame
 *    corners, types its heading and its cards fade in one after another.
 *    CSS does the drawing (html[data-transition] in globals.css, the skeleton in Layout); this
 *    only sets the state. The first page a visitor opens plays the same arrival, started before
 *    the first paint by src/config/boot-script.mjs.
 *
 * Nothing runs in the admin, and the page's content is always in the HTML: effects only
 * decorate it.
 */

export { ARRIVE_MS };
/** The shortest the skeleton shows between pages, so it reads as a step and not as a flicker. */
export const LOADER_MS = 650;
const INTERACTIVE = 'a[href], button:not(:disabled), summary, [role="button"], input[type="checkbox"], select';

const inAdmin = (path: string) => path.startsWith('/admin');

export function PageEffects() {
  const router = useRouter();
  const { sound, animate } = usePrefs();
  const play = useSound();
  // Router callbacks are registered once; they read the latest values through refs.
  const state = useRef({ sound, animate, play });
  useEffect(() => {
    state.current = { sound, animate, play };
  });

  // ── Hover and click sounds, for every link and button (one listener each) ──
  useEffect(() => {
    if (!sound) return;
    let last: Element | null = null;
    const target = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.(INTERACTIVE);
      return el && !el.closest('.adm, [data-no-sound]') ? el : null;
    };
    const onOver = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return; // phones have no hover
      const el = target(e);
      if (el && el !== last) play('hover');
      last = el;
    };
    const onClick = (e: MouseEvent) => {
      if (target(e)) play('click');
    };
    document.addEventListener('pointerover', onOver);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('click', onClick, true);
    };
  }, [sound, play]);

  // ── Page changes ──
  useEffect(() => {
    const root = document.documentElement;
    let timer = 0;
    // When the loading screen went up (0: none is showing).
    let loadingSince = 0;
    // The first-load arrival's timers (boot script), stopped if the visitor moves on first.
    const stopFirstLoad = () =>
      (window as { __csArrival?: number[] }).__csArrival?.splice(0).forEach((t) => window.clearTimeout(t));
    const clear = () => {
      window.clearTimeout(timer);
      stopFirstLoad();
      loadingSince = 0;
      delete root.dataset.transition;
    };
    const onStart = (url: string, { shallow }: { shallow: boolean }) => {
      if (shallow || inAdmin(url)) return;
      const { animate: a, play: p } = state.current;
      window.clearTimeout(timer);
      stopFirstLoad();
      p('transition');
      if (!a) return;
      loadingSince = Date.now();
      root.dataset.transition = 'loading';
    };
    const arrive = () => {
      const { animate: a, play: p } = state.current;
      loadingSince = 0;
      p('deploy');
      if (document.querySelector('main h1')) window.setTimeout(() => state.current.play('typing'), 120);
      if (!a) return clear();
      root.dataset.transition = 'in';
      timer = window.setTimeout(clear, ARRIVE_MS);
    };
    const onDone = (url: string, { shallow }: { shallow: boolean }) => {
      if (shallow || inAdmin(url)) return clear();
      window.clearTimeout(timer);
      // A fast page still keeps the skeleton up for LOADER_MS, then arrives.
      const wait = loadingSince ? LOADER_MS - (Date.now() - loadingSince) : 0;
      if (wait > 0) timer = window.setTimeout(arrive, wait);
      else arrive();
    };
    router.events.on('routeChangeStart', onStart);
    router.events.on('routeChangeComplete', onDone);
    router.events.on('routeChangeError', clear);
    return () => {
      router.events.off('routeChangeStart', onStart);
      router.events.off('routeChangeComplete', onDone);
      router.events.off('routeChangeError', clear);
      clear();
    };
  }, [router.events]);

  return (
    <>
      <SoundInvite />
      <SoundReminder />
    </>
  );
}

/**
 * soulextract.com asks "this site uses sounds" before showing anything. Here the page is
 * never held back: a small panel offers sound once, after a moment, and is gone for good
 * once answered (either way). Not in the admin, nor when sound is already on.
 */
function SoundInvite() {
  const router = useRouter();
  const { sound, invited } = usePrefs();
  const play = useSound();
  const panel = useRef<HTMLDivElement>(null);
  const show = !sound && !invited && !inAdmin(router.pathname);

  useEffect(() => {
    if (!show) return;
    const t = window.setTimeout(() => panel.current?.removeAttribute('hidden'), 1500);
    return () => window.clearTimeout(t);
  }, [show]);

  if (!show) return null;
  return (
    <div ref={panel} className="sound-invite" role="region" aria-label="Sound" hidden>
      <p>This site has interface sounds. Turn them on?</p>
      <div className="sound-invite-actions">
        <button
          type="button"
          className="btn pri"
          onClick={() => {
            setPref('invited', true);
            setPref('sound', true);
            // This click is the gesture that lets the browser play audio.
            play('start', true);
          }}
        >
          Turn on sound
        </button>
        <button type="button" className="btn" onClick={() => setPref('invited', true)}>
          No thanks
        </button>
      </div>
    </div>
  );
}

/**
 * Sound is on, but after a fresh load the browser keeps the page silent until the visitor clicks,
 * taps or presses a key (./audio-gate.ts). Rather than leave them wondering, a small panel says so
 * after a moment. Once shown it stays until answered or until the visitor uses the page elsewhere:
 * it can't simply go at the first press, or its own buttons would vanish under the pointer.
 */
function SoundReminder() {
  const router = useRouter();
  const { sound } = usePrefs();
  const allowed = useAudioAllowed();
  const play = useSound();
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const wanted = sound && !inAdmin(router.pathname);

  useEffect(() => {
    if (!wanted || allowed) return;
    const t = window.setTimeout(() => setOpen(true), 1500);
    return () => window.clearTimeout(t);
  }, [wanted, allowed]);

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (audioAllowed() && !panel.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', away, true);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', away, true);
    };
  }, [open]);

  if (!wanted || !open) return null;
  return (
    // data-no-sound: the start chime answers these buttons, not the click on top of it.
    <div ref={panel} className="sound-invite" role="region" aria-label="Sound" data-no-sound>
      <p>Sound is on. Your browser waits for a click or tap to play it.</p>
      <div className="sound-invite-actions">
        <button
          type="button"
          className="btn pri"
          onClick={() => {
            setOpen(false);
            play('start');
          }}
        >
          Start sound
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setOpen(false);
            setPref('sound', false);
          }}
        >
          Turn off
        </button>
      </div>
    </div>
  );
}
