import { useRouter } from 'next/router';
import { useEffect, useRef } from 'react';
import { usePrefs, useSound } from './arwes/prefs';
import { setPref } from './prefs-store';

/**
 * The site's sound and page-change effects, after the original Arwes sites (soulextract.com):
 *
 *  - Sounds, only once the visitor turns sound on: a tick when the pointer reaches a link or
 *    button, a click when one is used, a whoosh when leaving a page, then the new page
 *    "deploys" and its heading types in.
 *  - Page changes inside the site (motion on): the old page fades with a scan line; the new
 *    one draws its frame corners, types its heading and brings in its cards in sequence.
 *    CSS does the drawing (html[data-transition] in globals.css); this only sets the state.
 *    The first page a visitor opens is never animated, so it appears at once (LCP).
 *
 * Nothing runs in the admin, and the page's content is always in the HTML: effects only
 * decorate it.
 */

/** How long the arrival animation runs before the page is left alone. */
export const ARRIVE_MS = 900;
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
    const clear = () => {
      window.clearTimeout(timer);
      delete root.dataset.transition;
    };
    const onStart = (url: string, { shallow }: { shallow: boolean }) => {
      if (shallow || inAdmin(url)) return;
      const { animate: a, play: p } = state.current;
      p('transition');
      if (a) root.dataset.transition = 'out';
    };
    const onDone = (url: string, { shallow }: { shallow: boolean }) => {
      if (shallow || inAdmin(url)) return clear();
      const { animate: a, play: p } = state.current;
      p('deploy');
      if (document.querySelector('main h1')) window.setTimeout(() => state.current.play('typing'), 120);
      if (!a) return clear();
      root.dataset.transition = 'in';
      window.clearTimeout(timer);
      timer = window.setTimeout(clear, ARRIVE_MS);
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

  return <SoundInvite />;
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
