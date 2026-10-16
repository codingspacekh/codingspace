// One fixed time zone so server and client render the same date (no hydration mismatch).
const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Phnom_Penh',
});

export const formatDate = (iso: string) => DATE.format(new Date(iso));

const LEVELS = ['Beginner', 'Intermediate', 'Advanced'] as const;
export const levelLabel = (level: number) => LEVELS[Math.min(Math.max(level, 1), 3) - 1]!;

export function postMeta({
  publishedAt,
  minutes,
  problemCount,
}: {
  publishedAt: string;
  minutes: number;
  problemCount: number;
}): string {
  const parts = [`Published ${formatDate(publishedAt)}`, `${minutes} min read`];
  if (problemCount > 0) parts.push(`${problemCount} practice problem${problemCount === 1 ? '' : 's'}`);
  return parts.join(' · ');
}
