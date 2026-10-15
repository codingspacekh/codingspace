// The only module (with prefs.tsx and backdrop-canvas.tsx) that imports Arwes components. Decision D2.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Animator, BleepsOnAnimator, FrameCorners, Text } from '@arwes/react';
import { usePrefs } from './prefs';

const BackdropCanvas = dynamic(() => import('./backdrop-canvas'), { ssr: false });

/** Animated grid + dots, mounted only once the browser is idle after hydration (ADR 0001 finding 7). */
export function Backdrop() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1200));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = ric(() => setReady(true), { timeout: 2500 });
    return () => cancel(id);
  }, []);
  return (
    <div className="ui-backdrop" data-testid="backdrop" aria-hidden="true">
      {ready && <BackdropCanvas />}
    </div>
  );
}

/** A panel with Arwes corner brackets. Content inside is ordinary, always-visible markup. */
export function Frame({ children, className }: { children: ReactNode; className?: string }) {
  const { sound } = usePrefs();
  const ref = useRef<HTMLDivElement>(null);
  // The frame is decoration: hide its SVG from assistive technology.
  useEffect(() => {
    ref.current?.querySelector('svg.arwes-frames-frame')?.setAttribute('aria-hidden', 'true');
  });
  return (
    <Animator>
      <div ref={ref} className={['ui-frame', className].filter(Boolean).join(' ')}>
        <FrameCorners strokeWidth={2} cornerLength={18} />
        {sound && <BleepsOnAnimator transitions={{ entering: 'assemble' }} />}
        <div className="ui-frame__content">{children}</div>
      </div>
    </Animator>
  );
}

/** Short decorative text (headlines, labels) that "deciphers" in. Never use for body copy. */
export function Decipher({ children, className }: { children: string; className?: string }) {
  return (
    <Animator>
      <Text as="span" manager="decipher" className={className} fixed>
        {children}
      </Text>
    </Animator>
  );
}

/** Groups animated children so they enter one after another. */
export function Stagger({ children }: { children: ReactNode }) {
  return (
    <Animator root combine manager="stagger">
      {children}
    </Animator>
  );
}
