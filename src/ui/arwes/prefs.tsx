import { createContext, useCallback, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { audioAllowed, useAudioAllowed } from '../audio-gate';
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
  useSoundEngine(sound);

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
let bleepsModule: Promise<typeof import('./bleeps')> | undefined;
let bleeps: Promise<Bleeps> | undefined;
/** Downloads the sound module once. */
const loadModule = () => (bleepsModule ??= import('./bleeps'));
/**
 * Starts the sound engine once. Only called once the page may play sound (../audio-gate.ts):
 * started any earlier, the browser would keep it suspended.
 */
const loadBleeps = () => (bleeps ??= loadModule().then((m) => m.createSiteBleeps()));

/**
 * With sound on, the module downloads straight away and the engine starts with the visitor's first
 * click, tap or key press, so even the sound of that first click plays.
 */
function useSoundEngine(sound: boolean) {
  const allowed = useAudioAllowed();
  useEffect(() => {
    if (!sound) return;
    void loadModule();
    if (allowed) void loadBleeps();
  }, [sound, allowed]);
}

/**
 * Plays a bleep only when the visitor has turned sound on (or when forced by the sound toggle
 * itself), and only once the browser lets the page play sound: before that it would be lost.
 */
export function useSound() {
  const { sound } = usePrefs();
  return useCallback(
    (name: BleepName, force = false) => {
      if ((sound || force) && audioAllowed()) void loadBleeps().then((b) => b.bleeps[name]?.play());
    },
    [sound],
  );
}
