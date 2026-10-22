import { renderContent } from '@/server/render';
import type { LoadedContent } from './load';

/**
 * Publishes loaded content: renders each post (the same step the editor's Publish runs)
 * and writes database rows through a ContentStore. Safe to run again: rows are matched
 * by slug, and a post keeps its first publish date. Posts missing from content/ are
 * reported, never deleted.
 *
 * It overwrites drafts too: once a post is edited in the admin, re-importing it replaces those edits.
 */

export type SectionRow = { subject_id: string; slug: string; title: string; description: string; sort: number };

export type PostRow = {
  slug: string;
  kind: 'lesson' | 'life';
  subject_id: string | null;
  section_id: string | null;
  sort: number;
  level: number;
  minutes: number;
  problem_count: number;
  lang: 'en' | 'km';
  status: 'published';
  title: string;
  summary: string;
  content_json: unknown;
  live_title: string;
  live_summary: string;
  live_html: string;
  live_toc: unknown;
  live_search_text: string;
  live_has_math: boolean;
  live_has_code: boolean;
  published_at: string;
  live_updated_at: string;
  // The import publishes what it writes: draft and live are the same revision.
  revision: 1;
  live_revision: 1;
  live_subject_id: string | null;
  live_section_id: string | null;
  live_level: number;
  live_minutes: number;
  live_problem_count: number;
  live_lang: 'en' | 'km';
};

export type ProjectRow = {
  slug: string;
  name: string;
  glyph: string;
  subject_id: string | null;
  tag: string;
  description: string;
  platforms: string[];
  landing_url: string | null;
  is_featured: boolean;
  coming_soon: boolean;
  sort: number;
  tagline: string;
  intro: string;
  reasons: unknown[];
  features: unknown[];
  steps: unknown[];
  faq: unknown[];
  downloads: unknown[];
  version: string;
  source_url: string | null;
};

export type ProfileRow = {
  id: true;
  name: string;
  bio: string;
  years: number | null;
  students: number | null;
  email: string | null;
};

export type TimelineRow = { year: number; text: string; sort: number };

export type FeaturedProblemRow = {
  subject_id: string;
  section_id: string | null;
  week_of: string;
  statement: string;
  hint: string;
  solution: string;
  is_current: boolean;
};

export interface ContentStore {
  /** Upserts by (subject_id, slug); returns ids keyed "subject/slug". */
  upsertSections(rows: SectionRow[]): Promise<Map<string, string>>;
  /** Existing posts: slug → published_at. */
  publishedAt(): Promise<Map<string, string | null>>;
  upsertPosts(rows: PostRow[]): Promise<void>;
  replaceProjects(rows: ProjectRow[]): Promise<void>;
  upsertProfile(row: ProfileRow): Promise<void>;
  replaceTimeline(rows: TimelineRow[]): Promise<void>;
  replaceFeaturedProblems(rows: FeaturedProblemRow[]): Promise<void>;
  /** True once projects, the profile, the timeline or problems exist (e.g. edited in the admin). */
  hasSiteContent(): Promise<boolean>;
}

export type ImportReport = {
  sections: number;
  posts: number;
  projects: number;
  timeline: number;
  featuredProblems: number;
  /** 'kept': site content was already in the database and was left alone (M5: it is edited in the admin). */
  siteContent: 'imported' | 'kept';
  /** Published slugs in the database that content/ no longer has. */
  notInContent: string[];
};

export async function importContent(
  content: LoadedContent,
  store: ContentStore,
  now = new Date(),
  { replaceSiteContent = false }: { replaceSiteContent?: boolean } = {},
): Promise<ImportReport> {
  const stamp = now.toISOString();

  const sectionIds = await store.upsertSections(
    content.sections.map((s) => ({
      subject_id: s.subject,
      slug: s.slug,
      title: s.title,
      description: s.description,
      sort: s.sort,
    })),
  );
  const sectionId = (subject: string | null, slug: string | null) =>
    subject && slug ? (sectionIds.get(`${subject}/${slug}`) ?? null) : null;

  const existing = await store.publishedAt();
  const rows: PostRow[] = [];
  // Sequential: rendering is CPU-bound and keeps memory flat.
  for (const post of content.posts) {
    const out = await renderContent(post.doc, { lang: post.lang });
    const settings = {
      subject_id: post.subject,
      section_id: sectionId(post.subject, post.section),
      level: post.level,
      minutes: out.readingMinutes,
      problem_count: post.problemCount,
      lang: post.lang,
    };
    rows.push({
      slug: post.slug,
      kind: post.kind,
      sort: post.sort,
      ...settings,
      status: 'published',
      title: post.title,
      summary: post.summary,
      content_json: post.doc,
      live_title: post.title,
      live_summary: post.summary,
      live_html: out.html,
      live_toc: out.toc,
      live_search_text: out.searchText,
      live_has_math: out.hasMath,
      live_has_code: out.hasCode,
      published_at: existing.get(post.slug) ?? stamp,
      live_updated_at: stamp,
      revision: 1,
      live_revision: 1,
      live_subject_id: settings.subject_id,
      live_section_id: settings.section_id,
      live_level: settings.level,
      live_minutes: settings.minutes,
      live_problem_count: settings.problem_count,
      live_lang: settings.lang,
    });
  }
  await store.upsertPosts(rows);

  // From M5 the owner edits projects, profile, timeline and problems in the admin: only fill
  // them in when they are empty, unless asked to overwrite.
  const siteContent = replaceSiteContent || !(await store.hasSiteContent()) ? 'imported' : 'kept';
  if (siteContent === 'imported') await importSiteContent(content, store, sectionId);

  const inContent = new Set(content.posts.map((p) => p.slug));
  return {
    sections: content.sections.length,
    posts: rows.length,
    projects: content.projects.length,
    timeline: content.profile.timeline.length,
    featuredProblems: content.problems.length,
    siteContent,
    notInContent: [...existing.keys()].filter((slug) => !inContent.has(slug)).sort(),
  };
}

async function importSiteContent(
  content: LoadedContent,
  store: ContentStore,
  sectionId: (subject: string, slug: string | null) => string | null,
) {
  await store.replaceProjects(
    content.projects.map((p) => ({
      slug: p.slug,
      name: p.name,
      glyph: p.glyph,
      subject_id: p.subject,
      tag: p.tag,
      description: p.description,
      platforms: p.platforms,
      landing_url: p.landingUrl,
      is_featured: p.featured,
      coming_soon: p.comingSoon,
      sort: p.sort,
      tagline: p.page.tagline,
      intro: p.page.intro,
      reasons: p.page.reasons,
      features: p.page.features,
      steps: p.page.steps,
      faq: p.page.faq,
      downloads: p.page.downloads,
      version: p.page.version,
      source_url: p.page.sourceUrl,
    })),
  );

  const { timeline, ...profile } = content.profile;
  await store.upsertProfile({ id: true, ...profile });
  await store.replaceTimeline(timeline);

  await store.replaceFeaturedProblems(
    content.problems.map((p) => ({
      subject_id: p.subject,
      section_id: sectionId(p.subject, p.section),
      week_of: p.weekOf,
      statement: p.statement,
      hint: p.hint,
      solution: p.solution,
      is_current: p.current,
    })),
  );
}
