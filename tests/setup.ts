import '@testing-library/jest-dom/vitest';

// jsdom lacks ResizeObserver, which Arwes frames use to redraw on resize. Real browsers have it.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Display choices are remembered in localStorage (src/ui/prefs-store.ts): start each test fresh.
afterEach(() => {
  try {
    window.localStorage?.clear();
  } catch {
    // node environment: no storage
  }
});

// jsdom has <dialog> but not showModal/close (admin modals, src/views/admin/modal.tsx).
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}
