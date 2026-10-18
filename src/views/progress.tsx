import { progressOf, useDone, useHydrated } from '@/ui';

/**
 * "3 of 7 done" with a bar, from the lessons this visitor marked as done on this device (v1.1).
 * Shown only once the browser's list is read; nothing at all before any lesson is done.
 */
export function Progress({ slugs, label }: { slugs: readonly string[]; label: string }) {
  const done = useDone();
  const ready = useHydrated();
  const p = progressOf(slugs, done);
  if (!ready || p.done === 0 || !p.total) return null;
  return (
    <p className="progress">
      <progress value={p.done} max={p.total} aria-label={label} />
      <span className="meta">{p.done === p.total ? `All ${p.total} done ✓` : `${p.done} of ${p.total} done`}</span>
    </p>
  );
}

/** A tick after a lesson's title when this visitor has marked it done. */
export function DoneTick({ slug }: { slug: string }) {
  const done = useDone();
  const ready = useHydrated();
  if (!ready || !done[slug]) return null;
  return (
    <span className="done-tick">
      {' '}
      <span aria-hidden="true">✓</span>
      <span className="sr-only"> (done)</span>
    </span>
  );
}
