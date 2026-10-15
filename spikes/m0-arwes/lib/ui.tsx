// The only module that imports Arwes components. Pages use these wrappers (see 03 §6.1, decision D2).
import { useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Animator, BleepsOnAnimator, FrameCorners, Text } from '@arwes/react';
import Link from 'next/link';
import { usePrefs, useSound } from '@/lib/prefs';

const BackdropCanvas = dynamic(() => import('@/lib/backdrop-canvas'), { ssr: false });

/** Animated background, mounted only once the browser is idle after hydration. */
export function Backdrop() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1200));
    const id = ric(() => setReady(true), { timeout: 2500 } as IdleRequestOptions);
    return () => (window.cancelIdleCallback ?? window.clearTimeout)(id as number);
  }, []);
  return (
    <div className="backdrop" data-testid="backdrop" aria-hidden="true">
      {ready && <BackdropCanvas />}
    </div>
  );
}

export function Frame({ children, testId }: { children: ReactNode; testId?: string }) {
  const { sound } = usePrefs();
  return (
    <Animator>
      <div className="framed" data-testid={testId}>
        <FrameCorners strokeWidth={2} cornerLength={18} />
        {sound && <BleepsOnAnimator transitions={{ entering: 'assemble' }} />}
        {children}
      </div>
    </Animator>
  );
}

export function Decipher({ children, className }: { children: string; className?: string }) {
  return (
    <Animator>
      <Text as="span" manager="decipher" className={className} fixed>
        {children}
      </Text>
    </Animator>
  );
}

export function TopBar() {
  const { sound, toggleSound } = usePrefs();
  const play = useSound();
  return (
    <header className="bar">
      <Link href="/" className="logo" onMouseEnter={() => play('hover')}>
        Coding<b>Space</b>
      </Link>
      <button
        className="toggle"
        aria-pressed={sound}
        onClick={() => {
          toggleSound();
          // Turning sound on is the user gesture that unlocks audio; play a confirmation.
          if (!sound) play('click', true);
        }}
      >
        Sound {sound ? 'on' : 'off'}
      </button>
    </header>
  );
}
