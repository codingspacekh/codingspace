import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { BleepsProvider, useBleeps } from '@arwes/react';

type BleepName = 'click' | 'hover' | 'assemble';

const bleepsSettings = {
  master: { volume: 0.6 },
  // preload: false → no audio is fetched until the first play()
  common: { preload: false, muteOnWindowBlur: true },
  bleeps: {
    click: { sources: [{ src: '/sounds/click.wav', type: 'audio/wav' }], category: 'interaction' as const },
    hover: { sources: [{ src: '/sounds/hover.wav', type: 'audio/wav' }], category: 'interaction' as const, volume: 0.4 },
    assemble: { sources: [{ src: '/sounds/assemble.wav', type: 'audio/wav' }], category: 'transition' as const },
  },
};

type Prefs = { motion: boolean; sound: boolean; toggleSound: () => void };
const PrefsContext = createContext<Prefs>({ motion: true, sound: false, toggleSound: () => {} });

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  // Read the OS setting on the very first client render so animators start disabled.
  // This only changes context, never markup, so it can't cause a hydration mismatch.
  const [motion] = useState(() => !prefersReducedMotion());
  const [sound, setSound] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.motion = motion ? 'on' : 'off';
  }, [motion]);

  const toggleSound = useCallback(() => setSound((s) => !s), []);

  return (
    <PrefsContext.Provider value={{ motion, sound, toggleSound }}>
      <BleepsProvider {...bleepsSettings}>{children}</BleepsProvider>
    </PrefsContext.Provider>
  );
}

export const usePrefs = () => useContext(PrefsContext);

/** Plays a bleep only when the visitor has turned sound on. */
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
