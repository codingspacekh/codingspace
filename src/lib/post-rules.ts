/**
 * Rules for writing posts, shared by the editor (warnings as you type) and the server
 * (which enforces the required ones again in the database: private.assert_publishable).
 */

const MAX_SLUG = 60;

/**
 * URL slug from a title: ASCII letters and digits only (the posts.slug check), accents
 * dropped. Khmer titles have no Latin letters, so they get `fallback` (03 ADM-05).
 */
export function postSlug(title: string, fallback: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) return fallback;
  if (slug.length <= MAX_SLUG) return slug;
  const cut = slug.slice(0, MAX_SLUG + 1);
  const end = cut.lastIndexOf('-');
  return (end > 0 ? cut.slice(0, end) : slug.slice(0, MAX_SLUG)).replace(/-+$/, '');
}

type Node = { type?: unknown; content?: unknown; text?: unknown; attrs?: Record<string, unknown> };
const isNode = (n: unknown): n is Node => typeof n === 'object' && n !== null;
const kids = (n: Node): Node[] => (Array.isArray(n.content) ? n.content.filter(isNode) : []);

function* walk(n: Node): Generator<Node> {
  yield n;
  for (const k of kids(n)) yield* walk(k);
}

/** True when the body has something besides empty paragraphs. */
function hasBody(doc: unknown): boolean {
  if (!isNode(doc) || doc.type !== 'doc') return false;
  for (const n of walk(doc)) {
    if (n === doc) continue;
    if (n.type === 'text' && typeof n.text === 'string' && n.text.trim()) return true;
    if (n.type !== 'paragraph' && n.type !== 'text' && n.type !== 'hardBreak' && kids(n).length === 0) return true;
  }
  return false;
}

export type ChecklistItem = {
  id: 'title' | 'body' | 'section' | 'summary' | 'alt';
  label: string;
  required: boolean;
  ok: boolean;
};

export type DraftForChecklist = {
  kind: 'lesson' | 'life';
  title: string;
  summary: string;
  section_id: string | null;
  content_json: unknown;
};

/** 03 ADM-07 "Ready to publish?": required items block publishing; recommended ones warn. */
export function publishChecklist(d: DraftForChecklist): { ready: boolean; items: ChecklistItem[] } {
  const images = isNode(d.content_json) ? [...walk(d.content_json)].filter((n) => n.type === 'image') : [];
  const items: ChecklistItem[] = [
    { id: 'title', label: 'Title', required: true, ok: d.title.trim() !== '' },
    { id: 'body', label: 'Body', required: true, ok: hasBody(d.content_json) },
    ...(d.kind === 'lesson'
      ? [{ id: 'section' as const, label: 'Section', required: true, ok: d.section_id !== null }]
      : []),
    { id: 'summary', label: 'Summary', required: false, ok: d.summary.trim() !== '' },
    {
      id: 'alt',
      label: 'Alt text on every image',
      required: false,
      ok: images.every((i) => typeof i.attrs?.alt === 'string' && i.attrs.alt.trim() !== ''),
    },
  ];
  return { ready: items.every((i) => i.ok || !i.required), items };
}

const MINUTE = 60_000;
const YEAR = 365 * 24 * 60 * MINUTE;

/** Why a schedule time is not acceptable, or null. The cron runs every 5 minutes. */
export function scheduleProblem(at: Date, now = new Date()): 'invalid' | 'too_soon' | 'too_far' | null {
  if (Number.isNaN(at.getTime())) return 'invalid';
  if (at.getTime() < now.getTime() + MINUTE) return 'too_soon';
  if (at.getTime() > now.getTime() + YEAR) return 'too_far';
  return null;
}

export type PublishedRef = {
  slug: string;
  kind: 'lesson' | 'life';
  subject: string | null;
  previous_subject?: string | null;
  /** Live section now, and the one it left (an Update that moved it). */
  section?: string | null;
  previous_section?: string | null;
};

/**
 * Static (ISR) pages that show a post, to rebuild after publish / update / unpublish / delete
 * (03 §6.3). sitemap.xml and rss.xml are server-rendered with a 10-minute CDN cache instead.
 */
export function revalidationPaths(p: PublishedRef, sectionLessons: string[] = []): string[] {
  const paths = [`/posts/${p.slug}`, '/'];
  if (p.kind === 'life') paths.push('/author');
  for (const s of [p.subject, p.previous_subject]) if (s) paths.push(`/study/${s}`);
  // The other lessons in its section(s): their prev/next links and section list change too.
  for (const slug of sectionLessons) paths.push(`/posts/${slug}`);
  return [...new Set(paths)];
}

/** The list with the item at `index` moved one place up (-1) or down (+1); unchanged at the ends. */
export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  [next[index], next[to]] = [next[to]!, next[index]!];
  return next;
}
