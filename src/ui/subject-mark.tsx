import { ICON_BOX, ICON_STROKE, iconPath } from '@/lib/subject-icons';
import type { Subject } from '@/lib/subjects';

/**
 * A subject's mark: its icon if it has one (2026-10-23), else its symbol. Sized like text (1em
 * and a little), in the subject's colour, so it can stand wherever the symbol stood. Decoration:
 * callers hide it from assistive technology, as they did the symbol.
 */
export function SubjectMark({
  subject,
  fallback = '✦',
}: {
  subject: Pick<Subject, 'glyph' | 'icon'> | undefined;
  fallback?: string;
}) {
  const d = iconPath(subject?.icon);
  if (!d) return <>{subject ? subject.glyph : fallback}</>;
  return (
    <svg className="subject-icon" viewBox={ICON_BOX} aria-hidden="true" focusable="false">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
