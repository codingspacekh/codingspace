// Loaded only when a visitor turns sound on (sound is off by default), so most visitors never
// download it. Uses Arwes's framework-free bleeps manager; no React provider needed.
import { createBleepsManager } from '@arwes/bleeps';

/**
 * The ARWES sound set (MIT, public/sounds/LICENSE-arwes.txt), the family soulextract.com's
 * sounds come from, plus our own hover tick, page-leave whoosh and a soft click
 * (scripts/sound-synth.mjs): ARWES has no hover or leave sound, and its click felt harsh.
 */
export type BleepName = 'click' | 'hover' | 'typing' | 'deploy' | 'transition' | 'start';

export function createSiteBleeps() {
  return createBleepsManager<BleepName>({
    master: { volume: 0.6 },
    common: { preload: false, muteOnWindowBlur: true },
    bleeps: {
      hover: { sources: [{ src: '/sounds/hover.wav', type: 'audio/wav' }], category: 'interaction', volume: 0.4 },
      click: { sources: [{ src: '/sounds/click.wav', type: 'audio/wav' }], category: 'interaction', volume: 0.7 },
      typing: { sources: [{ src: '/sounds/type.mp3', type: 'audio/mpeg' }], category: 'transition', volume: 0.6 },
      deploy: { sources: [{ src: '/sounds/deploy.mp3', type: 'audio/mpeg' }], category: 'transition', volume: 0.8 },
      transition: {
        sources: [{ src: '/sounds/transition.wav', type: 'audio/wav' }],
        category: 'transition',
        volume: 0.5,
      },
      start: { sources: [{ src: '/sounds/intro.mp3', type: 'audio/mpeg' }], category: 'notification', volume: 0.8 },
    },
  });
}
