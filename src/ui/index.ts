// Public UI surface. Pages import from '@/ui', never from '@arwes/*' (decision D2, enforced by ESLint).
// package.json "sideEffects" lets webpack drop what a page doesn't use, so Arwes stays out of pages that
// don't render Frame, Decipher or Stagger.
export { UiRoot, usePrefs, useSound, type BleepName } from './arwes/prefs';
export { Decipher, Frame, Stagger } from './arwes/components';
export { Backdrop } from './backdrop';
export { OrbitHero } from './orbit/orbit-hero';
export { TopBar, type NavItem } from './top-bar';
export { SkipLink } from './skip-link';
export { PageEffects } from './page-effects';
export { VisitTracker } from './visit-tracker';
export { savePost, unsavePost, useSaved, type SavedPost } from './saved-store';
export { markDone, progressOf, unmarkDone, useDone, type DoneLessons } from './done-store';
export { useHydrated } from './hydrated';
