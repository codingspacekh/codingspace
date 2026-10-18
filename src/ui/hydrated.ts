import { useSyncExternalStore } from 'react';

const noop = () => () => {};

/**
 * False on the server and in the first render, true once the browser's own data (saved and done
 * lessons) can be read. Hides on-device state until then instead of flashing "nothing yet".
 */
export const useHydrated = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
