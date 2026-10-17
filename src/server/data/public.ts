import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { renderSnippet } from '@/server/render/snippet';
import { isSubjectId, SUBJECT_IDS, type SubjectId } from '@/lib/subjects';
import type { FeaturedProblem, Post, PostCard, PostPageData, Profile, Project, SectionWithLessons } from './types';

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
  subject: isSubjectId(r.subject_id) ? r.subject_id : null,
  level: r.level,
  minutes: r.minutes,
  lang: r.lang,
  publishedAt: r.published_at,
});

// ---------- home ----------

export async function getLessonCounts(): Promise<Record<SubjectId, number>> {
  const rows = must<{ subject_id: string; lesson_count: number }[]>(
    await db().from('public_sections').select('subject_id, lesson_count'),
    'sections',
  );
  const counts = Object.fromEntries(SUBJECT_IDS.map((s) => [s, 0])) as Record<SubjectId, number>;
  for (const r of rows) if (isSubjectId(r.subject_id)) counts[r.subject_id] += r.lesson_count;
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
  if (!p || !isSubjectId(p.subject_id)) return null;
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
  return must<{ slug: string }[]>(await db().from('public_posts').select('slug'), 'post slugs').map((r) => r.slug);
}

/** A real post slug (matches the DB CHECK on posts.slug). Anything else can't exist, so the page
 *  is a 404 and we never send it to the database — a junk address (e.g. an injection probe) would
 *  otherwise reach the WAF in front of the DB and come back as a non-JSON error, i.e. a 500. */
export const isPostSlug = (slug: string): boolean => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);

export async function getPostPage(slug: string): Promise<PostPageData | null> {
  if (!isPostSlug(slug)) return null;
  const row = must<{
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
        'slug, kind, title, summary, html, toc, subject_id, section_id, level, lang, minutes, problem_count, has_math, published_at, updated_at',
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
    subject: isSubjectId(row.subject_id) ? row.subject_id : null,
    level: row.level,
    lang: row.lang,
    minutes: row.minutes,
    problemCount: row.problem_count,
    hasMath: row.has_math,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
  if (!row.section_id) return { post, section: null, siblings: [] };

  const [section, siblings] = await Promise.all([
    db().from('public_sections').select('slug, title').eq('id', row.section_id).maybeSingle(),
    db().from('public_posts').select('slug, title').eq('section_id', row.section_id).order('sort').order('slug'),
  ]);
  return {
    post,
    section: must<{ slug: string; title: string } | null>(section, 'section'),
    siblings: must<{ slug: string; title: string }[]>(siblings, 'siblings'),
  };
}

// ---------- projects and author ----------

export async function getProjects(): Promise<Project[]> {
  const rows = must<
    {
      slug: string;
      name: string;
      glyph: string;
      subject_id: string | null;
      tag: string;
      description: string;
      platforms: string[];
      landing_url: string;
      is_featured: boolean;
    }[]
  >(
    await db()
      .from('public_projects')
      .select('slug, name, glyph, subject_id, tag, description, platforms, landing_url, is_featured')
      .order('is_featured', { ascending: false })
      .order('sort'),
    'projects',
  );
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    glyph: r.glyph,
    subject: isSubjectId(r.subject_id) ? r.subject_id : null,
    tag: r.tag,
    description: r.description,
    platforms: r.platforms,
    landingUrl: r.landing_url,
    featured: r.is_featured,
  }));
}

type ProfileRow = Omit<Profile, 'photo'> & {
  photo: string | null;
  photo_widths: number[];
  photo_width: number | null;
  photo_height: number | null;
};

export async function getAuthorPage(): Promise<{
  profile: Profile | null;
  timeline: { year: number; text: string }[];
  lifePosts: PostCard[];
}> {
  const [profile, timeline, life] = await Promise.all([
    db()
      .from('public_profile')
      .select('name, bio, years, students, email, photo, photo_widths, photo_width, photo_height')
      .maybeSingle(),
    db().from('public_timeline').select('year, text').order('sort'),
    db().from('public_posts').select(CARD_COLUMNS).eq('kind', 'life').order('published_at', { ascending: false }),
  ]);
  const p = must<ProfileRow | null>(profile, 'profile');
  return {
    profile: p && {
      name: p.name,
      bio: p.bio,
      years: p.years,
      students: p.students,
      email: p.email,
      photo:
        p.photo && p.photo_width && p.photo_height
          ? { id: p.photo, widths: p.photo_widths, width: p.photo_width, height: p.photo_height }
          : null,
    },
    timeline: must<{ year: number; text: string }[]>(timeline, 'timeline'),
    lifePosts: must<CardRow[]>(life, 'life posts').map(toCard),
  };
}

// ---------- SEO: sitemap, feed, author name ----------

export async function getSitemapPosts(): Promise<{ slug: string; updatedAt: string }[]> {
  const rows = must<{ slug: string; updated_at: string }[]>(
    await db().from('public_posts').select('slug, updated_at').order('slug'),
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
  const row = must<{ name: string } | null>(await db().from('public_profile').select('name').maybeSingle(), 'author');
  return row?.name ?? null;
}
