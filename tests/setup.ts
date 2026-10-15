import '@testing-library/jest-dom/vitest';

// jsdom lacks ResizeObserver, which Arwes frames use to redraw on resize. Real browsers have it.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
