/** A syllabus point's anchor on its syllabus page: "1.1" → #p-1-1, "4.2(a)" → #p-4-2-a. */
export const pointAnchor = (code: string) =>
  `p-${
    code
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'x'
  }`;

/**
 * Points pasted from a syllabus document, one per line: "1.1 Data representation",
 * "1.1 – Data representation", "1.1: Data representation" or code<Tab>title. Bullets and
 * blank lines are skipped; a line with no title after its code is a problem.
 */
export function parsePoints(text: string): { points: { code: string; title: string }[]; problems: string[] } {
  const points: { code: string; title: string }[] = [];
  const problems: string[] = [];
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.replace(/^\s*[-*•]\s+/, '').trim();
    if (!line) continue;
    const m = /^(\S+?)[\s:.–—-]*\s+(.+)$/.exec(line.replace(/\t/g, ' '));
    const code = m?.[1]?.replace(/[:.–—-]+$/, '');
    // A code has a number in it (1.1, 4.2(a), P1); otherwise the line is just words.
    if (!m || !code || !/\d/.test(code)) {
      problems.push(`Line ${i + 1}: “${line}” needs a code and a title, like “1.1 Data representation”.`);
      continue;
    }
    points.push({ code: code.slice(0, 20), title: m[2]!.trim().slice(0, 160) });
  }
  return { points, problems };
}
