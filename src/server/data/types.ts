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
};

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
  description: string;
  platforms: string[];
  landingUrl: string;
  featured: boolean;
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
  bio: string;
  years: number | null;
  students: number | null;
  email: string | null;
};
