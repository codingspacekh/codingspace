import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { importContent } from '@/server/content/import';
import { loadContent } from '@/server/content/load';
import { supabaseStore } from '@/server/content/supabase-store';
import {
  getAuthorName,
  getAuthorPage,
  getFeaturedProblem,
  getFeedPosts,
  getLatestLessons,
  getLessonCounts,
  getPostPage,
  getPostSlugs,
  getProjects,
  getSitemapPosts,
  getSubjectSections,
} from '@/server/data/public';

// The page data layer against a real database holding content/ (anon key, public views only).
const { API_URL, SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY } = process.env;
if (!API_URL || !SERVICE_ROLE_KEY || !NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Run with a local Supabase: set -a; eval "$(scripts/local-db-env.sh)"; set +a');
}

beforeAll(async () => {
  const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  await importContent(loadContent(join(__dirname, '../../content')), supabaseStore(admin));
});

describe('public page data', () => {
  it('counts lessons per subject for the Study tracks', async () => {
    expect(await getLessonCounts()).toEqual({ math: 3, physics: 2, coding: 3, it: 1 });
  });

  it('lists the latest lessons, never life posts', async () => {
    const latest = await getLatestLessons(20);
    expect(latest).toHaveLength(9);
    expect(latest.every((p) => p.subject !== null)).toBe(true);
  });

  it('groups a subject’s lessons into ordered sections, empty ones included', async () => {
    const sections = await getSubjectSections('math');
    expect(sections.map((s) => [s.slug, s.lessons.map((l) => l.slug)])).toEqual([
      ['inequalities', ['am-gm-inequality', 'cauchy-schwarz-inequality']],
      ['sequences', []],
      ['functional-equations', []],
      ['number-theory', ['modular-arithmetic']],
      ['combinatorics', []],
    ]);
  });

  it('loads a lesson with its section and siblings for prev/next', async () => {
    const page = await getPostPage('cauchy-schwarz-inequality');
    expect(page?.post).toMatchObject({ kind: 'lesson', subject: 'math', level: 2, hasMath: true });
    expect(page?.section).toEqual({ slug: 'inequalities', title: 'Inequalities' });
    expect(page?.siblings.map((s) => s.slug)).toEqual(['am-gm-inequality', 'cauchy-schwarz-inequality']);
    expect(page?.post.html).toContain('class="katex"');
  });

  it('loads a life post without a section, and nothing for an unknown slug', async () => {
    expect(await getPostPage('study-tips-km')).toMatchObject({
      post: { kind: 'life', lang: 'km', subject: null },
      section: null,
      siblings: [],
    });
    expect(await getPostPage('no-such-post')).toBeNull();
  });

  it('lists every published slug for the build', async () => {
    expect((await getPostSlugs()).sort()).toHaveLength(11);
  });

  it('renders the featured problem with its section', async () => {
    const problem = await getFeaturedProblem();
    expect(problem).toMatchObject({ subject: 'math', sectionTitle: 'Inequalities', hasMath: true });
    expect(problem?.statementHtml).toContain('class="katex"');
    expect(problem?.solutionHtml).not.toBe('');
  });

  it('puts the featured project first', async () => {
    const projects = await getProjects();
    expect(projects[0]).toMatchObject({ slug: 'pseudocode-runner', featured: true });
    expect(projects).toHaveLength(3);
  });

  it('loads the author page', async () => {
    const author = await getAuthorPage();
    expect(author.profile?.name).toBe('CodingSpace');
    expect(author.timeline).toHaveLength(4);
    expect(author.lifePosts.map((p) => p.slug).sort()).toEqual(['study-tips-km', 'why-i-started-codingspace']);
  });

  it('lists every post with its last update for the sitemap', async () => {
    const posts = await getSitemapPosts();
    expect(posts).toHaveLength(11);
    expect(posts.every((p) => !Number.isNaN(Date.parse(p.updatedAt)))).toBe(true);
  });

  it('feeds the newest posts, life posts included', async () => {
    const feed = await getFeedPosts(20);
    expect(feed).toHaveLength(11);
    expect(feed.some((p) => p.slug === 'why-i-started-codingspace')).toBe(true);
  });

  it('reads the author name', async () => {
    expect(await getAuthorName()).toBe('CodingSpace');
  });
});
