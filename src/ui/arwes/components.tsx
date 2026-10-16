// The only module (with bleeps.ts) that imports Arwes. Decision D2.
// Only pages that render these components (Home, error pages) download Arwes.
import { useEffect, useRef, type ReactNode } from 'react';
import { Animator, AnimatorGeneralProvider, FrameCorners, Text } from '@arwes/react';
import { usePrefs, useSound } from './prefs';

/** Arwes animation settings; disabled when motion is off (OS setting or the top-bar toggle). */
function ArwesScope({ children }: { children: ReactNode }) {
  const { motion } = usePrefs();
  return (
    <AnimatorGeneralProvider disabled={!motion} duration={{ enter: 0.4, exit: 0.3, stagger: 0.08 }}>
      {children}
    </AnimatorGeneralProvider>
  );
}

/** A panel with Arwes corner brackets. Content inside is ordinary, always-visible markup. */
export function Frame({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const play = useSound();
  // The frame is decoration: hide its SVG from assistive technology.
  useEffect(() => {
    ref.current?.querySelector('svg.arwes-frames-frame')?.setAttribute('aria-hidden', 'true');
  });
  useEffect(() => play('assemble'), [play]);
  return (
    <ArwesScope>
      <Animator>
        <div ref={ref} className={['ui-frame', className].filter(Boolean).join(' ')}>
          <FrameCorners strokeWidth={2} cornerLength={18} />
          <div className="ui-frame__content">{children}</div>
        </div>
      </Animator>
    </ArwesScope>
  );
}

/** Short decorative text (headlines, labels) that "deciphers" in. Use inside <Stagger>. Never for body copy. */
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
    <ArwesScope>
      <Animator root combine manager="stagger">
        {children}
      </Animator>
    </ArwesScope>
  );
}
