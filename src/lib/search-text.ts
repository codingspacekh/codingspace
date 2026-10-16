/**
 * Search snippets (03 PUB-09) come from the database with each match wrapped in U+0002 … U+0003
 * (supabase/migrations/20261023000000_search.sql). This splits them into plain and matched
 * parts, so the page can wrap matches in <mark> without ever treating the text as HTML.
 */
export type SnippetPart = { text: string; match: boolean };

const START = '\u0002';
const END = '\u0003';

export function snippetParts(snippet: string): SnippetPart[] {
  const parts: SnippetPart[] = [];
  for (const [i, chunk] of snippet.split(START).entries()) {
    if (i === 0) {
      if (chunk) parts.push({ text: chunk.replaceAll(END, ''), match: false });
      continue;
    }
    const end = chunk.indexOf(END);
    const matched = end === -1 ? chunk : chunk.slice(0, end);
    const rest = end === -1 ? '' : chunk.slice(end + 1).replaceAll(END, '');
    if (matched) parts.push({ text: matched, match: true });
    if (rest) parts.push({ text: rest, match: false });
  }
  return parts;
}

/** The search box's text, as the server will use it: trimmed, at most 100 characters. */
export const cleanQuery = (q: unknown): string => (typeof q === 'string' ? q.trim().slice(0, 100) : '');
