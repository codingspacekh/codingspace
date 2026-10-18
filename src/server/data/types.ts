import type { PhotoShape, SectionKind } from '@/lib/author';
import type { ProjectDownload, ProjectFeature, ProjectReason, ProjectStep } from '@/lib/project-page';
import type { SubjectId } from '@/lib/subjects';

// Shapes the pages receive (serialisable props). Read from the public_* views only.

export type TocItem = { id: string; text: string; level: 2 | 3 };

export type PostCard = {
  slug: string;
  title: string;
  summary: string;
  subject: SubjectId | null;
  level: number;
  minutes: number;
  lang: 'en' | 'km';
  publishedAt: string;
};

export type Post = {
  slug: string;
  kind: 'lesson' | 'life';
  title: string;
  summary: string;
  html: string;
  toc: TocItem[];
  subject: SubjectId | null;
  level: number;
  lang: 'en' | 'km';
  minutes: number;
  problemCount: number;
  hasMath: boolean;
  publishedAt: string;
  updatedAt: string;
};

export type PostPageData = {
  post: Post;
  section: { slug: string; title: string } | null;
  /** Lessons in the same section, in order (empty for life posts). */
  siblings: { slug: string; title: string }[];
  /** The series this lesson is in (v1.1), each with its place and neighbours. */
  series: SeriesNav[];
  /** The syllabus points it covers (v1.1). */
  syllabus?: SyllabusTag[];
};

/** "9618 · 1.1 Data representation", linking to that point on /syllabus/<slug>. */
export type SyllabusTag = { syllabus: string; syllabusCode: string; code: string; title: string };

export type SyllabusSummary = {
  slug: string;
  code: string;
  title: string;
  description: string;
  subject: SubjectId | null;
  points: number;
  /** Points with at least one published lesson. */
  covered: number;
};

export type SyllabusPageData = Omit<SyllabusSummary, 'points' | 'covered'> & {
  points: { code: string; title: string; lessons: PostCard[] }[];
};

/** A lesson in a series, as its neighbours' links show it. */
export type SeriesLink = { slug: string; title: string; subject: SubjectId | null };

/** "Part 3 of 7 in Maths for Physics", with the lessons before and after it. */
export type SeriesNav = {
  slug: string;
  title: string;
  position: number;
  total: number;
  prev: SeriesLink | null;
  next: SeriesLink | null;
  /** Every lesson's slug, in order: the visitor's progress through the series. */
  lessons: string[];
};

export type SeriesSummary = {
  slug: string;
  title: string;
  description: string;
  lessonCount: number;
  /** The lessons' slugs, in order: the visitor's progress through the series. */
  lessonSlugs: string[];
  /** The subjects its lessons come from, in the site's subject order (not `subjects`: _app reads that prop). */
  subjectIds: SubjectId[];
};

export type SeriesPageData = Omit<SeriesSummary, 'lessonCount' | 'lessonSlugs'> & { lessons: PostCard[] };

export type SectionWithLessons = {
  slug: string;
  title: string;
  description: string;
  lessons: (PostCard & { level: number })[];
};

export type Project = {
  slug: string;
  name: string;
  glyph: string;
  subject: SubjectId | null;
  tag: string;
  /** The card's text. */
  description: string;
  platforms: string[];
  /** The project's own website, if it has one. */
  landingUrl: string | null;
  featured: boolean;
  /** Has at least one download link (otherwise "Coming soon"). */
  available: boolean;
};

/** An image on a project page, from the media library (widths copied when the project is saved). */
export type ProjectScreenshot = {
  media: string;
  caption: string;
  alt: string;
  widths: number[];
  width: number;
  height: number;
};

/** /projects/<slug> (v1.1): a landing page in one fixed layout; empty sections don't show. */
export type ProjectPageData = {
  project: Project;
  tagline: string;
  introHtml: string;
  reasons: ProjectReason[];
  features: ProjectFeature[];
  steps: ProjectStep[];
  faq: { question: string; answerHtml: string }[];
  downloads: ProjectDownload[];
  version: string;
  sourceUrl: string | null;
  screenshots: ProjectScreenshot[];
  hasMath: boolean;
};

export type FeaturedProblem = {
  subject: SubjectId;
  sectionTitle: string | null;
  weekOf: string;
  statementHtml: string;
  hintHtml: string;
  solutionHtml: string;
  hasMath: boolean;
};

export type Profile = {
  name: string;
  /** Markdown, and as HTML from the same renderer as lessons. */
  bio: string;
  bioHtml: string;
  years: number | null;
  students: number | null;
  email: string | null;
  /** The author's photo (an uploaded image: its media id and variant widths), or null. */
  photo: { id: string; widths: number[]; width: number; height: number } | null;
  /** The frame around the photo or the initials. */
  photoShape: PhotoShape;
};

/** One entry of an Author page section; which fields are filled depends on the kind (src/lib/author.ts). */
export type AuthorPageItem = {
  title: string;
  subtitle: string;
  period: string;
  noteHtml: string;
  url: string | null;
  tags: string[];
};
export type AuthorPageSection = { id: string; kind: SectionKind; title: string; items: AuthorPageItem[] };
