import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  PROJECT_LIMITS,
  type ProjectDownload,
  type ProjectFaq,
  type ProjectFeature,
  type ProjectReason,
  type ProjectStep,
} from '@/lib/project-page';
import { markdownToDoc, type MarkdownResult } from './markdown';
import { SLUG } from '@/lib/slug';

/**
 * Reads and validates the content/ folder (content/README.md). Every problem is collected
 * and reported together, each prefixed with its file, so one run shows everything to fix.
 */

// The content/ folder holds starter content for the four seeded subjects only; subjects added
// in /admin/subjects get their lessons in the admin.
export const SUBJECTS = ['math', 'physics', 'coding', 'it'] as const;
export type Subject = (typeof SUBJECTS)[number];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type LoadedSection = { subject: Subject; slug: string; title: string; description: string; sort: number };

export type LoadedPost = {
  file: string;
  slug: string;
  kind: 'lesson' | 'life';
  subject: Subject | null;
  section: string | null;
  sort: number;
  level: 1 | 2 | 3;
  lang: 'en' | 'km';
  title: string;
  summary: string;
  doc: MarkdownResult['doc'];
  problemCount: number;
};

export type LoadedProject = {
  slug: string;
  name: string;
  glyph: string;
  subject: Subject | null;
  tag: string;
  description: string;
  platforms: string[];
  landingUrl: string | null;
  featured: boolean;
  sort: number;
  /** The project's landing page (v1.1); every part is optional. */
  page: {
    tagline: string;
    intro: string;
    reasons: ProjectReason[];
    features: ProjectFeature[];
    steps: ProjectStep[];
    faq: ProjectFaq[];
    downloads: ProjectDownload[];
    version: string;
    sourceUrl: string | null;
  };
};

export type LoadedProfile = {
  name: string;
  bio: string;
  years: number | null;
  students: number | null;
  email: string | null;
  timeline: { year: number; text: string; sort: number }[];
};

export type LoadedProblem = {
  subject: Subject;
  section: string | null;
  weekOf: string;
  statement: string;
  hint: string;
  solution: string;
  current: boolean;
};

export type LoadedContent = {
  sections: LoadedSection[];
  posts: LoadedPost[];
  projects: LoadedProject[];
  profile: LoadedProfile;
  problems: LoadedProblem[];
  /** Files marked `dummy: true`: placeholder content still to replace. */
  dummyFiles: number;
};

export class ContentError extends Error {
  constructor(public problems: string[]) {
    super(`content/ has ${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
}

// ---------- small field readers that record problems ----------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

class Problems {
  list: string[] = [];
  add(file: string, message: string) {
    this.list.push(`${file}: ${message}`);
  }
}

const HTTPS = /^https:\/\/\S+$/;
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v.trim() : fallback);
const int = (v: unknown, fallback: number): number | null =>
  v === undefined ? fallback : typeof v === 'number' && Number.isInteger(v) ? v : null;
const isSubject = (v: unknown): v is Subject => SUBJECTS.includes(v as Subject);

function readJson(dir: string, file: string, problems: Problems): Obj | null {
  try {
    const value: unknown = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    if (isObj(value)) return value;
    problems.add(file, 'must contain a JSON object');
  } catch (e) {
    problems.add(file, existsSync(join(dir, file)) ? `invalid JSON (${(e as Error).message})` : 'file is missing');
  }
  return null;
}

// ---------- sections, projects, profile, featured problems ----------

function loadSections(json: Obj | null, problems: Problems): LoadedSection[] {
  const file = 'sections.json';
  const out: LoadedSection[] = [];
  for (const [i, raw] of (Array.isArray(json?.sections) ? json.sections : []).entries()) {
    const s = isObj(raw) ? raw : {};
    const where = `section "${str(s.slug) || i + 1}"`;
    const slug = str(s.slug);
    const title = str(s.title);
    const sort = int(s.sort, 0);
    if (!isSubject(s.subject))
      problems.add(file, `${where}: subject must be ${SUBJECTS.slice(0, -1).join(', ')} or it`);
    if (!SLUG.test(slug)) problems.add(file, `${where}: slug must be lowercase letters, digits and hyphens`);
    if (!title || title.length > 120) problems.add(file, `${where}: title is required (max 120 characters)`);
    if (sort === null) problems.add(file, `${where}: sort must be a whole number`);
    if (isSubject(s.subject) && out.some((o) => o.subject === s.subject && o.slug === slug)) {
      problems.add(file, `${where}: duplicate section in ${s.subject}`);
    }
    if (isSubject(s.subject)) {
      out.push({ subject: s.subject, slug, title, description: str(s.description), sort: sort ?? 0 });
    }
  }
  return out;
}

function loadProjects(json: Obj | null, problems: Problems): LoadedProject[] {
  const file = 'projects.json';
  const out: LoadedProject[] = [];
  for (const [i, raw] of (Array.isArray(json?.projects) ? json.projects : []).entries()) {
    const p = isObj(raw) ? raw : {};
    const where = `project "${str(p.slug) || i + 1}"`;
    const landingUrl = str(p.landingUrl) || null;
    const page = isObj(p.page) ? p.page : {};
    const sourceUrl = str(page.sourceUrl) || null;
    if (!SLUG.test(str(p.slug))) problems.add(file, `${where}: slug must be lowercase letters, digits and hyphens`);
    if (!str(p.name)) problems.add(file, `${where}: name is required`);
    if (!str(p.description)) problems.add(file, `${where}: description is required`);
    for (const [key, v] of [
      ['landingUrl', landingUrl],
      ['page.sourceUrl', sourceUrl],
    ] as const)
      if (v !== null && !HTTPS.test(v)) problems.add(file, `${where}: ${key} must start with https://`);
    /** A list of objects with these string fields; the first is required. */
    const items = <K extends string>(key: keyof typeof PROJECT_LIMITS, fields: readonly K[]) => {
      const raw = page[key];
      if (raw === undefined) return [];
      const list = Array.isArray(raw) ? raw : [];
      const ok = list.every((i) => isObj(i) && fields.every((f) => i[f] === undefined || typeof i[f] === 'string'));
      if (
        !Array.isArray(raw) ||
        !ok ||
        list.length > PROJECT_LIMITS[key] ||
        list.some((i) => !str((i as Obj)[fields[0]!]))
      )
        problems.add(
          file,
          `${where}: page.${key} must be at most ${PROJECT_LIMITS[key]} items, each with ${fields[0]}`,
        );
      return list.map((i) => Object.fromEntries(fields.map((f) => [f, str((i as Obj)[f])])) as Record<K, string>);
    };
    const downloads = items('downloads', ['label', 'url'] as const);
    if (downloads.some((d) => !HTTPS.test(d.url)))
      problems.add(file, `${where}: every download url must start with https://`);
    if (p.subject !== undefined && !isSubject(p.subject)) problems.add(file, `${where}: unknown subject`);
    out.push({
      slug: str(p.slug),
      name: str(p.name),
      glyph: str(p.glyph),
      subject: isSubject(p.subject) ? p.subject : null,
      tag: str(p.tag),
      description: str(p.description),
      platforms: Array.isArray(p.platforms) ? p.platforms.filter((x): x is string => typeof x === 'string') : [],
      landingUrl,
      featured: p.featured === true,
      sort: int(p.sort, i) ?? i,
      page: {
        tagline: str(page.tagline),
        intro: str(page.intro),
        reasons: items('reasons', ['title', 'text'] as const),
        features: items('features', ['title', 'glyph', 'text'] as const),
        steps: items('steps', ['title', 'text'] as const),
        faq: items('faq', ['question', 'answer'] as const),
        downloads,
        version: str(page.version),
        sourceUrl,
      },
    });
  }
  if (out.filter((p) => p.featured).length > 1) problems.add(file, 'only one project can be featured');
  return out;
}

function loadProfile(json: Obj | null, problems: Problems): LoadedProfile {
  const file = 'profile.json';
  const p = json ?? {};
  if (!str(p.name)) problems.add(file, 'name is required');
  const timeline = (Array.isArray(p.timeline) ? p.timeline : []).flatMap((raw, i) => {
    const t = isObj(raw) ? raw : {};
    const year = int(t.year, -1);
    if (year === null || year < 1900 || year > 2200 || !str(t.text)) {
      problems.add(file, `timeline item ${i + 1}: needs a year and text`);
      return [];
    }
    return [{ year, text: str(t.text), sort: int(t.sort, i) ?? i }];
  });
  return {
    name: str(p.name),
    bio: str(p.bio),
    years: typeof p.years === 'number' ? p.years : null,
    students: typeof p.students === 'number' ? p.students : null,
    email: str(p.email) || null,
    timeline,
  };
}

function loadProblems(json: Obj | null, sections: LoadedSection[], problems: Problems): LoadedProblem[] {
  const file = 'featured-problems.json';
  const out: LoadedProblem[] = [];
  for (const [i, raw] of (Array.isArray(json?.problems) ? json.problems : []).entries()) {
    const p = isObj(raw) ? raw : {};
    const where = `problem ${i + 1}`;
    const section = str(p.section) || null;
    if (!isSubject(p.subject)) {
      problems.add(file, `${where}: subject must be ${SUBJECTS.slice(0, -1).join(', ')} or it`);
      continue;
    }
    if (section && !sections.some((s) => s.subject === p.subject && s.slug === section)) {
      problems.add(file, `${where}: section "${section}" does not exist in ${p.subject}`);
    }
    if (!DATE.test(str(p.weekOf))) problems.add(file, `${where}: weekOf must be a date (YYYY-MM-DD)`);
    if (!str(p.statement)) problems.add(file, `${where}: statement is required`);
    const current = p.current === true;
    if (current && out.some((o) => o.current && o.subject === p.subject)) {
      problems.add(file, `${where}: only one current problem per subject`);
    }
    out.push({
      subject: p.subject,
      section,
      weekOf: str(p.weekOf),
      statement: str(p.statement),
      hint: str(p.hint),
      solution: str(p.solution),
      current,
    });
  }
  return out;
}

// ---------- posts ----------

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** Counts the items of the first list after a "Problems" heading. */
function countProblems(doc: MarkdownResult['doc']): number {
  const blocks = doc.content;
  const i = blocks.findIndex(
    (b) =>
      b.type === 'heading' &&
      Array.isArray(b.content) &&
      (b.content as { text?: string }[])
        .map((c) => c.text ?? '')
        .join('')
        .trim()
        .toLowerCase() === 'problems',
  );
  const list =
    i >= 0 ? blocks.slice(i + 1).find((b) => b.type === 'orderedList' || b.type === 'bulletList') : undefined;
  return Array.isArray(list?.content) ? list.content.length : 0;
}

function loadPost(
  dir: string,
  folder: string,
  name: string,
  sections: LoadedSection[],
  problems: Problems,
): { post: LoadedPost | null; dummy: boolean } {
  const file = `posts/${folder}/${name}`;
  const slug = name.replace(/\.md$/, '');
  const raw = readFileSync(join(dir, file), 'utf8');

  const match = FRONT_MATTER.exec(raw);
  if (!match) {
    problems.add(file, 'missing front matter (start the file with --- and a title)');
    return { post: null, dummy: false };
  }
  let meta: Obj;
  try {
    const parsed: unknown = parseYaml(match[1]!);
    if (!isObj(parsed)) throw new Error('not a key: value list');
    meta = parsed;
  } catch (e) {
    problems.add(file, `invalid front matter (${(e as Error).message.split('\n')[0]})`);
    return { post: null, dummy: false };
  }

  const kind = folder === 'life' ? 'life' : 'lesson';
  const subject = kind === 'lesson' ? (folder as Subject) : null;
  const errorsBefore = problems.list.length;

  if (!SLUG.test(slug)) problems.add(file, 'file name must be a slug (lowercase letters, digits and hyphens)');
  const title = str(meta.title);
  if (!title) problems.add(file, 'title is required');
  else if (title.length > 200) problems.add(file, 'title is too long (max 200 characters)');
  const summary = str(meta.summary);
  if (summary.length > 300) problems.add(file, 'summary is too long (max 300 characters)');

  const section = str(meta.section) || null;
  if (kind === 'life' && section) problems.add(file, 'life posts have no section');
  if (kind === 'lesson' && !section) problems.add(file, 'section is required for lessons');
  if (kind === 'lesson' && section && !sections.some((s) => s.subject === subject && s.slug === section)) {
    problems.add(file, `section "${section}" does not exist in ${subject}`);
  }

  const sort = int(meta.sort, 0);
  if (sort === null) problems.add(file, 'sort must be a whole number');
  const level = int(meta.level, 1);
  if (level !== 1 && level !== 2 && level !== 3) problems.add(file, 'level must be 1, 2 or 3');
  const lang = meta.lang ?? 'en';
  if (lang !== 'en' && lang !== 'km') problems.add(file, 'lang must be en or km');

  const lineOffset = match[0].split('\n').length - 1;
  const body = markdownToDoc(raw.slice(match[0].length), { lineOffset });
  for (const w of body.warnings) problems.add(file, w);

  const problemCount = int(meta.problems, countProblems(body.doc));
  if (problemCount === null) problems.add(file, 'problems must be a whole number');

  const dummy = meta.dummy === true;
  if (problems.list.length > errorsBefore) return { post: null, dummy };
  return {
    dummy,
    post: {
      file,
      slug,
      kind,
      subject,
      section: kind === 'lesson' ? section : null,
      sort: sort ?? 0,
      level: level as 1 | 2 | 3,
      lang: lang as 'en' | 'km',
      title,
      summary,
      doc: body.doc,
      problemCount: problemCount ?? 0,
    },
  };
}

// ---------- entry point ----------

export function loadContent(dir: string): LoadedContent {
  const problems = new Problems();
  const json = {
    sections: readJson(dir, 'sections.json', problems),
    projects: readJson(dir, 'projects.json', problems),
    profile: readJson(dir, 'profile.json', problems),
    problems: readJson(dir, 'featured-problems.json', problems),
  };
  let dummyFiles = Object.values(json).filter((j) => j?.dummy === true).length;

  const sections = loadSections(json.sections, problems);
  const projects = loadProjects(json.projects, problems);
  const profile = loadProfile(json.profile, problems);
  const featured = loadProblems(json.problems, sections, problems);

  const posts: LoadedPost[] = [];
  const postsDir = join(dir, 'posts');
  const folders = existsSync(postsDir) ? readdirSync(postsDir).sort() : [];
  for (const folder of folders) {
    if (!statSync(join(postsDir, folder)).isDirectory()) continue;
    const files = readdirSync(join(postsDir, folder))
      .filter((f) => f.endsWith('.md'))
      .sort();
    if (folder !== 'life' && !isSubject(folder)) {
      for (const f of files) problems.add(`posts/${folder}/${f}`, 'folder must be math, physics, coding, it or life');
      continue;
    }
    for (const name of files) {
      const { post, dummy } = loadPost(dir, folder, name, sections, problems);
      if (dummy) dummyFiles++;
      if (!post) continue;
      const clash = posts.find((p) => p.slug === post.slug);
      if (clash) problems.add(post.file, `slug "${post.slug}" is already used by ${clash.file}`);
      else posts.push(post);
    }
  }

  if (problems.list.length) throw new ContentError(problems.list.sort());
  return { sections, posts, projects, profile, problems: featured, dummyFiles };
}
