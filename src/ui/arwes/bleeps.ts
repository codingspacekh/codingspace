// Loaded only when a visitor turns sound on (sound is off by default), so most visitors never
// download it. Uses Arwes's framework-free bleeps manager; no React provider needed.
import { createBleepsManager } from '@arwes/bleeps';

export type BleepName = 'click' | 'hover' | 'assemble';

export function createSiteBleeps() {
  return createBleepsManager<BleepName>({
    master: { volume: 0.6 },
    common: { preload: false, muteOnWindowBlur: true },
    bleeps: {
      click: { sources: [{ src: '/sounds/click.wav', type: 'audio/wav' }], category: 'interaction' },
      hover: { sources: [{ src: '/sounds/hover.wav', type: 'audio/wav' }], category: 'interaction', volume: 0.4 },
      assemble: { sources: [{ src: '/sounds/assemble.wav', type: 'audio/wav' }], category: 'transition' },
    },
  });
}
