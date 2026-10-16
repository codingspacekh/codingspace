// Public UI surface. Pages import from '@/ui', never from '@arwes/*' (decision D2, enforced by ESLint).
export { UiRoot, usePrefs, useSound, type BleepName } from './arwes/prefs';
export { Backdrop, Decipher, Frame, Stagger } from './arwes/components';
export { TopBar, type NavItem } from './top-bar';
export { SkipLink } from './skip-link';
