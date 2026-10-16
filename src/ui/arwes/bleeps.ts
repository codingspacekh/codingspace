// Loaded only when a visitor turns sound on (sound is off by default), so most visitors never
// download it. Uses Arwes's framework-free bleeps manager; no React provider needed.
import { createBleepsManager } from '@arwes/bleeps';

/** Our own synthesised sounds (scripts/sound-synth.mjs). */
export type BleepName = 'click' | 'hover' | 'typing' | 'deploy' | 'transition' | 'start';

export function createSiteBleeps() {
  return createBleepsManager<BleepName>({
    master: { volume: 0.6 },
    common: { preload: false, muteOnWindowBlur: true },
    bleeps: {
      hover: { sources: [{ src: '/sounds/hover.wav', type: 'audio/wav' }], category: 'interaction', volume: 0.4 },
      click: { sources: [{ src: '/sounds/click.wav', type: 'audio/wav' }], category: 'interaction' },
      typing: { sources: [{ src: '/sounds/typing.wav', type: 'audio/wav' }], category: 'transition', volume: 0.5 },
      deploy: { sources: [{ src: '/sounds/deploy.wav', type: 'audio/wav' }], category: 'transition', volume: 0.7 },
      transition: {
        sources: [{ src: '/sounds/transition.wav', type: 'audio/wav' }],
        category: 'transition',
        volume: 0.6,
      },
      start: { sources: [{ src: '/sounds/start.wav', type: 'audio/wav' }], category: 'notification', volume: 0.8 },
    },
  });
}
