import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AnimatorGeneralProvider, BleepsProvider, useBleeps } from '@arwes/react';

export type BleepName = 'click' | 'hover' | 'assemble';

const bleepsSettings = {
  master: { volume: 0.6 },
  // preload: false → no audio is fetched until the first play() (ADR 0001 finding 6)
  common: { preload: false, muteOnWindowBlur: true },
  bleeps: {
    click: { sources: [{ src: '/sounds/click.wav', type: 'audio/wav' }], category: 'interaction' as const },
    hover: {
      sources: [{ src: '/sounds/hover.wav', type: 'audio/wav' }],
      category: 'interaction' as const,
      volume: 0.4,
    },
    assemble: { sources: [{ src: '/sounds/assemble.wav', type: 'audio/wav' }], category: 'transition' as const },
  },
};

type Prefs = { motion: boolean; sound: boolean; toggleSound: () => void };
const PrefsContext = createContext<Prefs>({ motion: false, sound: false, toggleSound: () => {} });

function osAllowsMotion() {
  return typeof window === 'undefined' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Root of all UI state: motion (from the OS, overridable in tests) and sound (off by default).
 * Read the OS setting on the very first client render so animators start disabled.
 */
export function UiRoot({ children, motion: forcedMotion }: { children: ReactNode; motion?: boolean }) {
  const [motion] = useState(() => forcedMotion ?? osAllowsMotion());
  const [sound, setSound] = useState(false);
  const toggleSound = useCallback(() => setSound((s) => !s), []);

  useEffect(() => {
    document.documentElement.dataset.motion = motion ? 'on' : 'off';
  }, [motion]);

  return (
    <PrefsContext.Provider value={{ motion, sound, toggleSound }}>
      <BleepsProvider {...bleepsSettings}>
        <AnimatorGeneralProvider disabled={!motion} duration={{ enter: 0.4, exit: 0.3, stagger: 0.08 }}>
          {children}
        </AnimatorGeneralProvider>
      </BleepsProvider>
    </PrefsContext.Provider>
  );
}

export const usePrefs = () => useContext(PrefsContext);

/** Plays a bleep only when the visitor has turned sound on (or when forced by the sound toggle itself). */
export function useSound() {
  const bleeps = useBleeps<BleepName>();
  const { sound } = usePrefs();
  return useCallback(
    (name: BleepName, force = false) => {
      if (sound || force) bleeps[name]?.play();
    },
    [bleeps, sound],
  );
}
