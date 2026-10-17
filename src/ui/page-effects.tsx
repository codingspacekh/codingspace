import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { isSubjectId, SUBJECTS } from '@/lib/subjects';
import { usePrefs, useSound } from './arwes/prefs';
import { setPref } from './prefs-store';

/**
 * The site's sound and page-change effects, after the original Arwes sites (soulextract.com):
 *
 *  - Sounds, only once the visitor turns sound on: a tick when the pointer reaches a link or
 *    button, a click when one is used, a whoosh when leaving a page, then the new page
 *    "deploys" and its heading types in.
 *  - Page changes inside the site (motion on): the old page goes with a scan line and a short
 *    loading screen shows (at least LOADER_MS); then the new page draws its frame corners,
 *    types its heading and brings in its cards in sequence.
 *    CSS does the drawing (html[data-transition] in globals.css); this only sets the state.
 *    The first page a visitor opens is never animated, so it appears at once (LCP).
 *
 * Nothing runs in the admin, and the page's content is always in the HTML: effects only
 * decorate it.
 */

/** How long the arrival animation runs before the page is left alone. */
export const ARRIVE_MS = 900;
/** The shortest a loading screen shows, so it reads as a step and not as a flicker. */
export const LOADER_MS = 650;
const INTERACTIVE = 'a[href], button:not(:disabled), summary, [role="button"], input[type="checkbox"], select';

const inAdmin = (path: string) => path.startsWith('/admin');

type Loader = { label: string; color: string };

const PAGES: Record<string, string> = {
  '/': 'Home',
  '/projects': 'Projects',
  '/author': 'Author',
  '/search': 'Search',
};

/** What the loading screen says on the way to a page (like soulextract.com's), in its colour. */
export function loaderFor(url: string): Loader {
  const path = url.split(/[?#]/)[0]!.replace(/(.)\/$/, '$1');
  const subject = /^\/study\/([^/]+)$/.exec(path)?.[1];
  if (isSubjectId(subject)) return { label: SUBJECTS[subject].name, color: SUBJECTS[subject].color };
  if (/^\/posts\/[^/]+$/.test(path)) return { label: 'Lesson', color: 'cyan' };
  return { label: PAGES[path] ?? 'Page', color: 'cyan' };
}

export function PageEffects() {
  const router = useRouter();
  const { sound, animate } = usePrefs();
  const play = useSound();
  const [loader, setLoader] = useState<Loader | null>(null);
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
    const clear = () => {
      window.clearTimeout(timer);
      loadingSince = 0;
      setLoader(null);
      delete root.dataset.transition;
    };
    const onStart = (url: string, { shallow }: { shallow: boolean }) => {
      if (shallow || inAdmin(url)) return;
      const { animate: a, play: p } = state.current;
      window.clearTimeout(timer);
      p('transition');
      if (!a) return;
      loadingSince = Date.now();
      setLoader(loaderFor(url));
      root.dataset.transition = 'loading';
    };
    const arrive = () => {
      const { animate: a, play: p } = state.current;
      loadingSince = 0;
      setLoader(null);
      p('deploy');
      if (document.querySelector('main h1')) window.setTimeout(() => state.current.play('typing'), 120);
      if (!a) return clear();
      root.dataset.transition = 'in';
      timer = window.setTimeout(clear, ARRIVE_MS);
    };
    const onDone = (url: string, { shallow }: { shallow: boolean }) => {
      if (shallow || inAdmin(url)) return clear();
      window.clearTimeout(timer);
      // A fast page still keeps the loading screen up for LOADER_MS, then arrives.
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
      {loader && <PageLoader {...loader} />}
      <SoundInvite />
    </>
  );
}

/** The loading screen: a framed panel with the destination and a bar filling in steps.
 * Decorative (screen readers hear the new page's title from Next's route announcer). */
function PageLoader({ label, color }: Loader) {
  return (
    <div className={`page-loader c-${color}`} aria-hidden="true" data-testid="page-loader">
      <div className="page-loader-box frame">
        <span className="page-loader-label">
          Loading <b>{label}</b>
        </span>
        <span className="page-loader-bar" />
      </div>
    </div>
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
