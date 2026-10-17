/**
 * The Author page's sections (03 ADM-14, owner request 2026-10-17), shared by the admin, the
 * server and the public page. No zod: this file is part of the admin's browser bundle.
 */

export type SectionKind =
  'timeline' | 'experience' | 'education' | 'skills' | 'awards' | 'hobbies' | 'life_posts' | 'custom';
export type ItemField = 'title' | 'subtitle' | 'period' | 'note' | 'url' | 'tags';

/** Parts of the header the owner can hide (the name always shows). */
export const HEADER_PARTS = ['photo', 'bio', 'years', 'students', 'email'] as const;
export type HeaderPart = (typeof HEADER_PARTS)[number];

export type AuthorItem = {
  title: string;
  subtitle: string;
  period: string;
  /** Markdown. */
  note: string;
  url: string | null;
  tags: string[];
  visible: boolean;
};
export type AuthorSection = { kind: SectionKind; title: string; visible: boolean; items: AuthorItem[] };

type Kind = {
  /** The heading a new page starts with; the owner can change it. */
  title: string;
  /** The admin's "add" button. */
  add: string;
  /** The fields this kind uses, with their labels in the admin. */
  fields: Partial<Record<ItemField, string>>;
};

export const KINDS: Record<SectionKind, Kind> = {
  timeline: { title: 'Timeline', add: 'Add an entry', fields: { period: 'Year', title: 'What happened' } },
  experience: {
    title: 'Experience',
    add: 'Add a job',
    fields: { title: 'Role', subtitle: 'Where', period: 'When (e.g. 2019 – now)', note: 'What you did (optional)' },
  },
  education: {
    title: 'Education',
    add: 'Add a qualification',
    fields: {
      title: 'Qualification',
      subtitle: 'School or university',
      period: 'Years (e.g. 2012 – 2016)',
      note: 'Details (optional)',
    },
  },
  skills: {
    title: 'Skills',
    add: 'Add a group of skills',
    fields: { title: 'Group (e.g. Programming)', tags: 'Skills, separated by commas' },
  },
  awards: {
    title: 'Awards & certificates',
    add: 'Add an award',
    fields: {
      title: 'Award or certificate',
      subtitle: 'Given by (optional)',
      period: 'Year (optional)',
      url: 'Link (optional)',
    },
  },
  hobbies: {
    title: 'Hobbies & interests',
    add: 'Add a hobby',
    fields: { title: 'Hobby', note: 'A line about it (optional)' },
  },
  life_posts: { title: 'Life posts', add: '', fields: {} },
  custom: {
    title: '',
    add: 'Add an item',
    fields: {
      title: 'Item',
      subtitle: 'Detail (optional)',
      period: 'When (optional)',
      note: 'More (optional)',
      url: 'Link (optional)',
    },
  },
};

/** Every page has each of these once (in the owner's order); custom sections come and go. */
export const BUILT_IN = ['timeline', 'experience', 'education', 'skills', 'awards', 'hobbies', 'life_posts'] as const;

/** The item with only the fields its kind of section uses (the rest emptied). */
export function cleanItem(kind: SectionKind, item: AuthorItem): AuthorItem {
  const uses = (f: ItemField) => f in KINDS[kind].fields;
  return {
    title: item.title,
    subtitle: uses('subtitle') ? item.subtitle : '',
    period: uses('period') ? item.period : '',
    note: uses('note') ? item.note : '',
    url: uses('url') ? item.url : null,
    tags: uses('tags') ? item.tags : [],
    visible: item.visible,
  };
}

/** "Python, C++ , python" → ["Python", "C++"]: trimmed, no empty ones, no repeats (any case). */
export function splitTags(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
}

/** Markdown → one line of plain text (the page's meta description), at most `max` characters. */
export function plainText(md: string, max = 160): string {
  const text = md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
