import { createContext, useCallback, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { getPrefs, getServerPrefs, setPref, SERVER_PREFS, subscribe, type Prefs } from '../prefs-store';
import type { BleepName } from './bleeps';

export type { BleepName };

type PrefsContextValue = Prefs & {
  /** Motion that actually runs: the visitor's choice, and never in reading mode. */
  animate: boolean;
  toggleSound: () => void;
  toggleMotion: () => void;
  toggleReading: () => void;
};
const PrefsContext = createContext<PrefsContextValue>({
  ...SERVER_PREFS,
  motion: false,
  animate: false,
  toggleSound: () => {},
  toggleMotion: () => {},
  toggleReading: () => {},
});

/**
 * Root of all UI state (03 PUB-11): motion (follows the OS setting until the visitor picks),
 * sound (off by default) and reading mode, remembered in this browser (./prefs-store.ts).
 * `motion` forces motion on or off (tests). Plain React on purpose: no Arwes code runs on
 * pages that don't animate (M2 Lighthouse gate).
 */
export function UiRoot({ children, motion: forcedMotion }: { children: ReactNode; motion?: boolean }) {
  const stored = useSyncExternalStore(subscribe, getPrefs, getServerPrefs);
  const motion = forcedMotion ?? stored.motion;
  const { sound, reading, invited } = stored;
  const animate = motion && !reading;
  const toggleSound = useCallback(() => setPref('sound', !getPrefs().sound), []);
  const toggleMotion = useCallback(() => setPref('motion', !getPrefs().motion), []);
  const toggleReading = useCallback(() => setPref('reading', !getPrefs().reading), []);

  useEffect(() => {
    const root = document.documentElement.dataset;
    root.motion = animate ? 'on' : 'off';
    root.reading = reading ? 'on' : 'off';
  }, [animate, reading]);

  return (
    <PrefsContext.Provider
      value={{ motion, sound, reading, invited, animate, toggleSound, toggleMotion, toggleReading }}
    >
      {children}
    </PrefsContext.Provider>
  );
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
