/** Previous and next lesson within a section (siblings already in section order). */
export function neighbours<T extends { slug: string }>(siblings: T[], slug: string) {
  const i = siblings.findIndex((s) => s.slug === slug);
  if (i < 0) return { prev: null, next: null };
  return { prev: siblings[i - 1] ?? null, next: siblings[i + 1] ?? null };
}
