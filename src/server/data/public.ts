import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { renderSnippet, renderVisitorText } from '@/server/render/snippet';
import {
  sectionOrder,
  type PageSection,
  type ProjectDownload,
  type ProjectFaq,
  type ProjectFeature,
  type ProjectHighlight,
  type ProjectReason,
  type ProjectReplaced,
  type ProjectRequirement,
  type ProjectStep,
} from '@/lib/project-page';
import type { Subject, SubjectId } from '@/lib/subjects';
import { plainText, type PhotoShape, type SectionKind } from '@/lib/author';
import type {
  AuthorPageItem,
  AuthorPageSection,
  FeaturedProblem,
  Post,
  PostCard,
  PostPageData,
  Profile,
  Project,
  ProjectPageData,
  ProjectScreenshot,
  ProjectShowcase,
  SectionWithLessons,
  SeriesNav,
  SeriesPageData,
  SeriesSummary,
  SyllabusPageData,
  SyllabusSummary,
  SyllabusTag,
  QuestionsPage,
} from './types';
import { isSlug } from '@/lib/slug';
import { allRows } from '@/server/db-rows';

/**
 * Read side for public pages (getStaticProps only). Uses the anon key and the public_*
 * views, so it can only ever see published content, whatever the query says.
 */

let client: SupabaseClient | undefined;

export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set to build pages.');
  }
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

function must<T>({ data, error }: { data: T | null; error: { message: string } | null }, what: string): T {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data as T;
}

const CARD_COLUMNS = 'slug, title, summary, subject_id, level, minutes, lang, published_at';

type CardRow = {
  slug: string;
  title: string;
  summary: string | null;
  subject_id: string | null;
  level: number;
  minutes: number;
  lang: 'en' | 'km';
  published_at: string;
};

const toCard = (r: CardRow): PostCard => ({
  slug: r.slug,
  title: r.title,
  summary: r.summary ?? '',
  subject: r.subject_id,
  level: r.level,
  minutes: r.minutes,
  lang: r.lang,
  publishedAt: r.published_at,
});

// ---------- subjects (every page: menus and footer) ----------

/** The visible subjects in site order (RLS hides the others from the anon key). */
export async function getSubjects(): Promise<Subject[]> {
  return must<Subject[]>(
    await db().from('subjects').select('id, name, glyph, color, blurb, intro').order('sort').order('id'),
    'subjects',
  );
}

// ---------- home ----------

export async function getLessonCounts(): Promise<Record<SubjectId, number>> {
  const rows = must<{ subject_id: string; lesson_count: number }[]>(
    await db().from('public_sections').select('subject_id, lesson_count'),
    'sections',
  );
  const counts: Record<SubjectId, number> = {};
  for (const r of rows) counts[r.subject_id] = (counts[r.subject_id] ?? 0) + r.lesson_count;
  return counts;
}

export async function getLatestLessons(limit = 6): Promise<PostCard[]> {
  const rows = must<CardRow[]>(
    await db()
      .from('public_posts')
      .select(CARD_COLUMNS)
      .eq('kind', 'lesson')
      .order('published_at', { ascending: false })
      .order('slug')
      .limit(limit),
    'latest lessons',
  );
  return rows.map(toCard);
}

/** Problem statements are short Markdown with $maths$; rendered like lesson content. */

/** The newest current problem (Home), or one subject's current problem (its subject page). */
export async function getFeaturedProblem(subject?: SubjectId): Promise<FeaturedProblem | null> {
  let query = db()
    .from('public_featured_problems')
    .select('subject_id, section_id, week_of, statement, hint, solution')
    .order('week_of', { ascending: false })
    .limit(1);
  if (subject) query = query.eq('subject_id', subject);
  const rows = must<
    {
      subject_id: string;
      section_id: string | null;
      week_of: string;
      statement: string;
      hint: string;
      solution: string;
    }[]
  >(await query, 'featured problem');
  const p = rows[0];
  if (!p) return null;
  const section = p.section_id
    ? must<{ title: string } | null>(
        await db().from('public_sections').select('title').eq('id', p.section_id).maybeSingle(),
        'problem section',
      )
    : null;
  const [statement, hint, solution] = await Promise.all([
    renderSnippet(p.statement),
    renderSnippet(p.hint),
    renderSnippet(p.solution),
  ]);
  return {
    subject: p.subject_id,
    sectionTitle: section?.title ?? null,
    weekOf: p.week_of,
    statementHtml: statement.html,
    hintHtml: hint.html,
    solutionHtml: solution.html,
    hasMath: statement.hasMath || hint.hasMath || solution.hasMath,
  };
}

// ---------- study ----------

export async function getSubjectSections(subject: SubjectId): Promise<SectionWithLessons[]> {
  const [sections, lessons] = await Promise.all([
    db().from('public_sections').select('id, slug, title, description, sort').eq('subject_id', subject).order('sort'),
    db()
      .from('public_posts')
      .select(`${CARD_COLUMNS}, section_id, sort`)
      .eq('kind', 'lesson')
      .eq('subject_id', subject)
      .order('sort'),
  ]);
  const sectionRows = must<{ id: string; slug: string; title: string; description: string }[]>(sections, 'sections');
  const lessonRows = must<(CardRow & { section_id: string })[]>(lessons, 'lessons');
  return sectionRows.map((s) => ({
    slug: s.slug,
    title: s.title,
    description: s.description,
    lessons: lessonRows.filter((l) => l.section_id === s.id).map(toCard),
  }));
}

// ---------- posts ----------

export async function getPostSlugs(): Promise<string[]> {
  return must<{ slug: string }[]>(
    await allRows((from, to) => db().from('public_posts').select('slug').order('slug').range(from, to)),
    'post slugs',
  ).map((r) => r.slug);
}

/** A real post slug (matches the DB CHECK on posts.slug). Anything else can't exist, so the page
 *  is a 404 and we never send it to the database — a junk address (e.g. an injection probe) would
 *  otherwise reach the WAF in front of the DB and come back as a non-JSON error, i.e. a 500. */
export const isPostSlug = isSlug;

export async function getPostPage(slug: string): Promise<PostPageData | null> {
  if (!isPostSlug(slug)) return null;
  const row = must<{
    id: string;
    slug: string;
    kind: 'lesson' | 'life';
    title: string;
    summary: string | null;
    html: string | null;
    toc: Post['toc'] | null;
    subject_id: string | null;
    section_id: string | null;
    level: number;
    lang: 'en' | 'km';
    minutes: number;
    problem_count: number;
    has_math: boolean;
    published_at: string;
    updated_at: string;
  } | null>(
    await db()
      .from('public_posts')
      .select(
        'id, slug, kind, title, summary, html, toc, subject_id, section_id, level, lang, minutes, problem_count, has_math, published_at, updated_at',
      )
      .eq('slug', slug)
      .maybeSingle(),
    'post',
  );
  if (!row) return null;

  const post: Post = {
    slug: row.slug,
    kind: row.kind,
    title: row.title,
    summary: row.summary ?? '',
    html: row.html ?? '',
    toc: row.toc ?? [],
    subject: row.subject_id,
    level: row.level,
    lang: row.lang,
    minutes: row.minutes,
    problemCount: row.problem_count,
    hasMath: row.has_math,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
  // Life posts have no section: only their comments (v1.1).
  if (!row.section_id) {
    const page = await getQuestionsPage(row.id);
    return {
      post,
      section: null,
      siblings: [],
      series: [],
      syllabus: [],
      questions: page.questions,
      questionsMore: page.more,
    };
  }

  const [section, siblings, series, syllabus, page] = await Promise.all([
    db().from('public_sections').select('slug, title').eq('id', row.section_id).maybeSingle(),
    db().from('public_posts').select('slug, title').eq('section_id', row.section_id).order('sort').order('slug'),
    getSeriesNav(row.slug),
    getSyllabusTags(row.slug),
    getQuestionsPage(row.id),
  ]);
  return {
    post,
    section: must<{ slug: string; title: string } | null>(section, 'section'),
    siblings: must<{ slug: string; title: string }[]>(siblings, 'siblings'),
    series,
    syllabus,
    questions: page.questions,
    questionsMore: page.more,
  };
}

// ---------- syllabus tags (v1.1) ----------

async function getSyllabusTags(slug: string): Promise<SyllabusTag[]> {
  const rows = must<{ syllabus_slug: string; syllabus_code: string; point_code: string; point_title: string }[]>(
    await db()
      .from('public_syllabus_lessons')
      .select('syllabus_slug, syllabus_code, point_code, point_title')
      .eq('slug', slug)
      .order('syllabus_code')
      .order('point_sort'),
    'syllabus tags',
  );
  return rows.map((r) => ({
    syllabus: r.syllabus_slug,
    syllabusCode: r.syllabus_code,
    code: r.point_code,
    title: r.point_title,
  }));
}

type SyllabusRow = {
  id: string;
  slug: string;
  code: string;
  title: string;
  description: string;
  subject_id: string | null;
};
const SYLLABUS_COLUMNS = 'id, slug, code, title, description, subject_id';

/** Every syllabus with at least one point, in the owner's order. */
export async function getSyllabusList(): Promise<SyllabusSummary[]> {
  const [syllabuses, points, lessons] = await Promise.all([
    db().from('syllabuses').select(SYLLABUS_COLUMNS).order('sort'),
    allRows((from, to) => db().from('syllabus_points').select('id, syllabus_id').order('id').range(from, to)),
    allRows((from, to) =>
      db().from('public_syllabus_lessons').select('point_id').order('point_id').order('slug').range(from, to),
    ),
  ]);
  const pointRows = must<{ id: string; syllabus_id: string }[]>(points, 'syllabus points');
  const covered = new Set(must<{ point_id: string }[]>(lessons, 'syllabus lessons').map((l) => l.point_id));
  return must<SyllabusRow[]>(syllabuses, 'syllabuses').flatMap((s) => {
    const mine = pointRows.filter((p) => p.syllabus_id === s.id);
    if (!mine.length) return [];
    return [
      {
        slug: s.slug,
        code: s.code,
        title: s.title,
        description: s.description,
        subject: s.subject_id,
        points: mine.length,
        covered: mine.filter((p) => covered.has(p.id)).length,
      },
    ];
  });
}

export async function getSyllabusSlugs(): Promise<string[]> {
  return (await getSyllabusList()).map((s) => s.slug);
}

/** A syllabus: every point in order, each with the published lessons that cover it. */
export async function getSyllabusPage(slug: string): Promise<SyllabusPageData | null> {
  if (!isPostSlug(slug)) return null;
  const s = must<SyllabusRow | null>(
    await db().from('syllabuses').select(SYLLABUS_COLUMNS).eq('slug', slug).maybeSingle(),
    'syllabus',
  );
  if (!s) return null;
  const [points, lessons] = await Promise.all([
    db().from('syllabus_points').select('id, code, title').eq('syllabus_id', s.id).order('sort'),
    db()
      .from('public_syllabus_lessons')
      .select(`point_id, ${CARD_COLUMNS}`)
      .eq('syllabus_id', s.id)
      .order('published_at'),
  ]);
  const pointRows = must<{ id: string; code: string; title: string }[]>(points, 'syllabus points');
  if (!pointRows.length) return null;
  const lessonRows = must<(CardRow & { point_id: string })[]>(lessons, 'syllabus lessons');
  return {
    slug: s.slug,
    code: s.code,
    title: s.title,
    description: s.description,
    subject: s.subject_id,
    points: pointRows.map((p) => ({
      code: p.code,
      title: p.title,
      lessons: lessonRows.filter((l) => l.point_id === p.id).map(toCard),
    })),
  };
}

/** How many questions (comments) a post shows at a time; "Show older" loads the next ones. */
export const QUESTIONS_PAGE = 20;

/** A published_at as the database sends it, e.g. 2026-10-18T03:00:00.123456+00:00 (a page's cursor). */
export const isQuestionCursor = (v: string) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(v) && !Number.isNaN(Date.parse(v));

/**
 * Approved questions under a lesson (comments under a life post), newest first, a page at a time:
 * the ones published before `before` when given. `more` is how many older ones are left. Both
 * sides are Markdown (v1.1).
 */
export async function getQuestionsPage(postId: string, before?: string): Promise<QuestionsPage> {
  let query = db()
    .from('questions')
    .select('id, name, body, answer, published_at', { count: 'exact' })
    .eq('post_id', postId)
    .order('published_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(QUESTIONS_PAGE);
  if (before) query = query.lt('published_at', before);
  const result = await query;
  const rows = must<{ id: string; name: string; body: string; answer: string; published_at: string }[]>(
    result,
    'questions',
  );
  const questions = await Promise.all(
    rows.map(async (q) => {
      // The visitor's text is rendered as theirs; the teacher's answer like the rest of the site.
      const [body, answer] = await Promise.all([renderVisitorText(q.body), renderSnippet(q.answer)]);
      return {
        id: q.id,
        name: q.name,
        bodyHtml: body.html,
        answerHtml: answer.html,
        publishedAt: q.published_at,
        hasMath: body.hasMath || answer.hasMath,
      };
    }),
  );
  return { questions, more: Math.max(0, (result.count ?? rows.length) - rows.length) };
}

/** The live post a question page belongs to (for the older-questions page and its API). */
export async function getQuestionsPost(slug: string) {
  return must<{ id: string; slug: string; title: string; kind: 'lesson' | 'life' } | null>(
    await db().from('public_posts').select('id, slug, title, kind').eq('slug', slug).maybeSingle(),
    'post',
  );
}

// ---------- series (v1.1) ----------

type SeriesLessonRow = CardRow & { series_id: string; position: number };
const SERIES_LESSON_COLUMNS = `series_id, position, ${CARD_COLUMNS}`;

/** The subjects a series' lessons come from, in the site's subject order. */
const subjectsOf = (order: Subject[], lessons: { subject_id: string | null }[]): SubjectId[] =>
  order.map((s) => s.id).filter((s) => lessons.some((l) => l.subject_id === s));

/** Each series the lesson is in: its place, and the lessons before and after it. */
async function getSeriesNav(slug: string): Promise<SeriesNav[]> {
  const mine = must<{ series_id: string }[]>(
    await db().from('public_series_lessons').select('series_id').eq('slug', slug),
    'series of lesson',
  );
  const ids = mine.map((r) => r.series_id);
  if (!ids.length) return [];
  const [series, lessons] = await Promise.all([
    db().from('public_series').select('id, slug, title').in('id', ids).order('sort'),
    db().from('public_series_lessons').select('series_id, position, slug, title, subject_id').in('series_id', ids),
  ]);
  const lessonRows = must<Pick<SeriesLessonRow, 'series_id' | 'position' | 'slug' | 'title' | 'subject_id'>[]>(
    lessons,
    'series lessons',
  );
  return must<{ id: string; slug: string; title: string }[]>(series, 'series').map((s) => {
    const list = lessonRows.filter((l) => l.series_id === s.id).sort((a, b) => a.position - b.position);
    const i = list.findIndex((l) => l.slug === slug);
    const link = (l: (typeof list)[number] | undefined) =>
      l ? { slug: l.slug, title: l.title, subject: l.subject_id } : null;
    return {
      slug: s.slug,
      title: s.title,
      position: i + 1,
      total: list.length,
      prev: link(list[i - 1]),
      next: link(list[i + 1]),
      lessons: list.map((l) => l.slug),
    };
  });
}

/** Every series with at least one published lesson, in the owner's order. */
export async function getSeriesList(): Promise<SeriesSummary[]> {
  const [series, lessons, order] = await Promise.all([
    db().from('public_series').select('id, slug, title, description, lesson_count').gt('lesson_count', 0).order('sort'),
    allRows((from, to) =>
      db()
        .from('public_series_lessons')
        .select('series_id, subject_id, slug, position')
        .order('position')
        .order('series_id')
        .range(from, to),
    ),
    getSubjects(),
  ]);
  const lessonRows = must<{ series_id: string; subject_id: string | null; slug: string }[]>(lessons, 'series lessons');
  return must<{ id: string; slug: string; title: string; description: string; lesson_count: number }[]>(
    series,
    'series',
  ).map((s) => ({
    slug: s.slug,
    title: s.title,
    description: s.description,
    lessonCount: s.lesson_count,
    lessonSlugs: lessonRows.filter((l) => l.series_id === s.id).map((l) => l.slug),
    subjectIds: subjectsOf(
      order,
      lessonRows.filter((l) => l.series_id === s.id),
    ),
  }));
}

export async function getSeriesSlugs(): Promise<string[]> {
  return (await getSeriesList()).map((s) => s.slug);
}

export async function getSeriesPage(slug: string): Promise<SeriesPageData | null> {
  if (!isPostSlug(slug)) return null;
  const series = must<{ id: string; slug: string; title: string; description: string } | null>(
    await db().from('public_series').select('id, slug, title, description').eq('slug', slug).maybeSingle(),
    'series',
  );
  if (!series) return null;
  const [lessons, order] = await Promise.all([
    db().from('public_series_lessons').select(SERIES_LESSON_COLUMNS).eq('series_id', series.id).order('position'),
    getSubjects(),
  ]);
  const rows = must<SeriesLessonRow[]>(lessons, 'series lessons');
  if (!rows.length) return null;
  return {
    slug: series.slug,
    title: series.title,
    description: series.description,
    subjectIds: subjectsOf(order, rows),
    lessons: rows.map(toCard),
  };
}

// ---------- projects and author ----------

type ProjectRow = {
  id: string;
  slug: string;
  name: string;
  glyph: string;
  subject_id: string | null;
  tag: string;
  description: string;
  platforms: string[];
  landing_url: string | null;
  is_featured: boolean;
  downloads: ProjectDownload[];
};
const PROJECT_CARD =
  'id, slug, name, glyph, subject_id, tag, description, platforms, landing_url, is_featured, downloads';

const toProject = (r: ProjectRow): Project => ({
  slug: r.slug,
  name: r.name,
  glyph: r.glyph,
  subject: r.subject_id,
  tag: r.tag,
  description: r.description,
  platforms: r.platforms,
  landingUrl: r.landing_url,
  featured: r.is_featured,
  available: r.downloads.length > 0,
});

export async function getProjects(): Promise<Project[]> {
  const rows = must<ProjectRow[]>(
    await db().from('public_projects').select(PROJECT_CARD).order('is_featured', { ascending: false }).order('sort'),
    'projects',
  );
  return rows.map(toProject);
}

export async function getProjectSlugs(): Promise<string[]> {
  return must<{ slug: string }[]>(
    await allRows((from, to) => db().from('public_projects').select('slug').order('slug').range(from, to)),
    'project slugs',
  ).map((r) => r.slug);
}

/** A project's landing page (v1.1): the intro and FAQ answers are Markdown, rendered like lessons. */
export async function getProjectPage(slug: string): Promise<ProjectPageData | null> {
  if (!isPostSlug(slug)) return null;
  const row = must<
    | (ProjectRow & {
        tagline: string;
        intro: string;
        reasons: ProjectReason[];
        features: ProjectFeature[];
        steps: ProjectStep[];
        faq: ProjectFaq[];
        version: string;
        source_url: string | null;
        highlights: ProjectHighlight[];
        why_title: string;
        why_text: string;
        replaces: ProjectReplaced[];
        requirements: ProjectRequirement[];
        requirements_note: string;
        release_date: string | null;
        release_notes: string;
        section_order: string[];
        hidden_sections: PageSection[];
      })
    | null
  >(
    await db()
      .from('public_projects')
      .select(
        `${PROJECT_CARD}, tagline, intro, reasons, features, steps, faq, version, source_url, highlights, ` +
          'why_title, why_text, replaces, requirements, requirements_note, release_date, release_notes, ' +
          'section_order, hidden_sections',
      )
      .eq('slug', slug)
      .maybeSingle(),
    'project',
  );
  if (!row) return null;
  const shots = must<ProjectScreenshot[]>(
    await db()
      .from('public_project_screenshots')
      .select('media, caption, alt, widths, width, height')
      .eq('project_id', row.id)
      .order('position'),
    'project screenshots',
  );
  const showcase = must<ProjectShowcase[]>(
    await db()
      .from('public_project_showcase')
      .select('media, label, title, text, points, color, alt, widths, width, height')
      .eq('project_id', row.id)
      .order('position'),
    'project showcase',
  );
  const [intro, ...answers] = await Promise.all([
    renderSnippet(row.intro),
    ...row.faq.map((f) => renderSnippet(f.answer)),
  ]);
  return {
    project: toProject(row),
    tagline: row.tagline,
    introHtml: intro!.html,
    reasons: row.reasons,
    features: row.features,
    steps: row.steps,
    faq: row.faq.map((f, i) => ({ question: f.question, answerHtml: answers[i]!.html })),
    downloads: row.downloads,
    version: row.version,
    sourceUrl: row.source_url,
    screenshots: shots,
    hasMath: intro!.hasMath || answers.some((a) => a.hasMath),
    sections: sectionOrder(row.section_order).filter((s) => !row.hidden_sections.includes(s)),
    highlights: row.highlights,
    whyTitle: row.why_title,
    whyText: row.why_text,
    replaces: row.replaces,
    requirements: row.requirements,
    requirementsNote: row.requirements_note,
    releaseDate: row.release_date,
    releaseNotes: row.release_notes
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
    showcase,
  };
}

type AuthorPageRow = {
  profile:
    | (Omit<Profile, 'photo' | 'photoShape' | 'bioHtml'> & {
        photo: string | null;
        /** Missing until migration 20261029000000 is applied. */
        photo_shape?: PhotoShape;
        photo_widths: number[];
        photo_width: number | null;
        photo_height: number | null;
      })
    | null;
  sections: {
    id: string;
    kind: SectionKind;
    title: string;
    items: (Omit<AuthorPageItem, 'noteHtml'> & { note: string })[];
  }[];
};

/**
 * The Author page (03 ADM-14): everything the owner chose to show, in their order. author_page()
 * leaves hidden parts out in the database. Sections with no items are dropped here, except life
 * posts (which says "No posts yet"); the bio and notes are Markdown, rendered like a problem.
 */
export async function getAuthorPage(): Promise<{
  profile: Profile | null;
  description: string;
  sections: AuthorPageSection[];
  lifePosts: PostCard[];
  hasMath: boolean;
}> {
  const [page, life] = await Promise.all([
    db().rpc('author_page'),
    db().from('public_posts').select(CARD_COLUMNS).eq('kind', 'life').order('published_at', { ascending: false }),
  ]);
  const { profile: p, sections } = must<AuthorPageRow>(page, 'author page');
  let hasMath = false;
  const render = async (md: string) => {
    const out = await renderSnippet(md);
    hasMath ||= out.hasMath;
    return out.html;
  };
  const shown = sections.filter((s) => s.kind === 'life_posts' || s.items.length > 0);
  return {
    profile: p && {
      name: p.name,
      bio: p.bio,
      bioHtml: await render(p.bio),
      years: p.years,
      students: p.students,
      email: p.email,
      photo:
        p.photo && p.photo_width && p.photo_height
          ? { id: p.photo, widths: p.photo_widths, width: p.photo_width, height: p.photo_height }
          : null,
      photoShape: p.photo_shape ?? 'hexagon',
    },
    description: plainText(p?.bio ?? ''),
    sections: await Promise.all(
      shown.map(async (s) => ({
        id: s.id,
        kind: s.kind,
        title: s.title,
        items: await Promise.all(s.items.map(async ({ note, ...i }) => ({ ...i, noteHtml: await render(note) }))),
      })),
    ),
    lifePosts: must<CardRow[]>(life, 'life posts').map(toCard),
    hasMath,
  };
}

// ---------- SEO: sitemap, feed, author name ----------

export async function getSitemapPosts(): Promise<{ slug: string; updatedAt: string }[]> {
  const rows = must<{ slug: string; updated_at: string }[]>(
    await allRows((from, to) => db().from('public_posts').select('slug, updated_at').order('slug').range(from, to)),
    'sitemap posts',
  );
  return rows.map((r) => ({ slug: r.slug, updatedAt: r.updated_at }));
}

export async function getFeedPosts(limit = 20): Promise<PostCard[]> {
  const rows = must<CardRow[]>(
    await db().from('public_posts').select(CARD_COLUMNS).order('published_at', { ascending: false }).limit(limit),
    'feed',
  );
  return rows.map(toCard);
}

export async function getAuthorName(): Promise<string | null> {
  return must<AuthorPageRow>(await db().rpc('author_page'), 'author').profile?.name ?? null;
}
