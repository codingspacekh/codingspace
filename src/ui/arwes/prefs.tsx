import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { BleepName } from './bleeps';

export type { BleepName };

type Prefs = { motion: boolean; sound: boolean; toggleSound: () => void; toggleMotion: () => void };
const PrefsContext = createContext<Prefs>({
  motion: false,
  sound: false,
  toggleSound: () => {},
  toggleMotion: () => {},
});

function osAllowsMotion() {
  return typeof window === 'undefined' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Root of all UI state: motion (starts from the OS setting, overridable in tests, and
 * switchable from the top bar) and sound (off by default).
 * Plain React on purpose: no Arwes code runs on pages that don't animate (M2 Lighthouse gate).
 */
export function UiRoot({ children, motion: forcedMotion }: { children: ReactNode; motion?: boolean }) {
  const [motion, setMotion] = useState(() => forcedMotion ?? osAllowsMotion());
  const [sound, setSound] = useState(false);
  const toggleSound = useCallback(() => setSound((s) => !s), []);
  const toggleMotion = useCallback(() => setMotion((m) => !m), []);

  useEffect(() => {
    document.documentElement.dataset.motion = motion ? 'on' : 'off';
  }, [motion]);

  return <PrefsContext.Provider value={{ motion, sound, toggleSound, toggleMotion }}>{children}</PrefsContext.Provider>;
}

export const usePrefs = () => useContext(PrefsContext);

type Bleeps = ReturnType<typeof import('./bleeps').createSiteBleeps>;
let bleeps: Promise<Bleeps> | undefined;
/** Downloads the sound module once, on first use. */
const loadBleeps = () => (bleeps ??= import('./bleeps').then((m) => m.createSiteBleeps()));

/** Plays a bleep only when the visitor has turned sound on (or when forced by the sound toggle itself). */
export function useSound() {
  const { sound } = usePrefs();
  return useCallback(
    (name: BleepName, force = false) => {
      if (sound || force) void loadBleeps().then((b) => b.bleeps[name]?.play());
    },
    [sound],
  );
}
