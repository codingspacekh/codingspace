import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { useSubjects } from '@/lib/subjects';
import { usePrefs, useSound } from '../arwes/prefs';
import type { Orbit } from './engine';

/** The engine has eight rings; later subjects are only in Study below. */
const MAX_NODES = 8;

/** Waits until the browser is idle and the element is (nearly) on screen: the orbit never delays first paint. */
function whenIdleAndVisible(el: Element, run: () => void): () => void {
  let cancelled = false;
  let idle = 0;
  const io =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          ([entry]) => {
            if (!entry?.isIntersecting) return;
            io?.disconnect();
            const go = () => !cancelled && run();
            // Safari has no requestIdleCallback.
            if (typeof window.requestIdleCallback === 'function')
              idle = window.requestIdleCallback(go, { timeout: 2500 });
            else idle = setTimeout(go, 200) as unknown as number;
          },
          { rootMargin: '200px' },
        );
  if (io) io.observe(el);
  else run();
  return () => {
    cancelled = true;
    io?.disconnect();
    if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
    else clearTimeout(idle);
  };
}

/**
 * The orbit hero (04 M6): the subjects (up to eight) circling a wireframe core; click one to open it.
 * Decoration with a pointer shortcut: the same subjects are ordinary links in Study below,
 * so the whole thing is hidden from assistive technology and keyboard focus.
 * The engine (./engine.ts) is downloaded only after the page is idle and the hero is on
 * screen, so Home's first-load JavaScript doesn't grow (NFR-PERF-2).
 */
export function OrbitHero() {
  const { animate } = usePrefs();
  const play = useSound();
  const router = useRouter();
  const { subjects, subject } = useSubjects();
  const shown = subjects.slice(0, MAX_NODES);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const orbit = useRef<Orbit | null>(null);
  const animateRef = useRef(animate);
  const shownRef = useRef(shown);
  const [target, setTarget] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Callbacks the engine keeps: read the latest values through refs.
  const playRef = useRef(play);
  const routerRef = useRef(router);
  useEffect(() => {
    playRef.current = play;
    routerRef.current = router;
    animateRef.current = animate;
    shownRef.current = shown;
  });

  useEffect(() => {
    const el = box.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    let alive = true;
    const cancel = whenIdleAndVisible(el, () => {
      void import('./engine').then(({ startOrbit }) => {
        if (!alive) return;
        const style = getComputedStyle(cv);
        const font = style.getPropertyValue('--font-mono').trim() || 'monospace';
        orbit.current = startOrbit(cv, {
          // Colours come from the same CSS variables as the c-<colour> classes.
          nodes: shownRef.current.map((s) => ({
            id: s.id,
            name: s.name,
            glyph: s.glyph,
            color: style.getPropertyValue(`--${s.color}`).trim() || '#18e4ec',
          })),
          motion: animateRef.current,
          font: `${font}, ui-monospace, monospace`,
          onHover: (id) => {
            setTarget(id);
            if (id) playRef.current('hover');
          },
          onSelect: (id) => {
            playRef.current('click');
            void routerRef.current.push(`/study/${id}`);
          },
        });
        setReady(true);
      });
    });
    return () => {
      alive = false;
      cancel();
      orbit.current?.stop();
      orbit.current = null;
    };
  }, []);

  useEffect(() => orbit.current?.setMotion(animate), [animate]);

  return (
    <div ref={box} className={`orbit${ready ? ' is-ready' : ''}`} aria-hidden="true" data-testid="orbit">
      <canvas ref={canvas} />
      {/* The subject under the pointer, named in words. */}
      <div className="hud">{subject(target)?.name}</div>
    </div>
  );
}
