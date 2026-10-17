import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * A modal window (the browser's own <dialog>): focus moves into it and stays there, the page
 * behind can't be used, Escape closes it, and focus returns to the button that opened it.
 * Focus starts in its first field.
 * Render it only while it is open.
 */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  // Read the latest onClose without reopening the dialog.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current!;
    const opener = document.activeElement as HTMLElement | null;
    dialog.showModal();
    // Start in the first field, not on the close button.
    dialog.querySelector<HTMLElement>('input, textarea, select')?.focus();
    const onCancel = (e: Event) => {
      // Escape: let React unmount it, rather than the browser closing it under React.
      e.preventDefault();
      close.current();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      if (dialog.open) dialog.close();
      opener?.focus();
    };
  }, []);

  return (
    <dialog ref={ref} className="adm-modal frame" aria-labelledby={`${id}-t`}>
      <div className="adm-modal-head">
        <h2 id={`${id}-t`}>{title}</h2>
        <button type="button" className="btn" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      {children}
    </dialog>
  );
}
