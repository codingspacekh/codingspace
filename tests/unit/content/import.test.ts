import { join } from 'node:path';
import { importContent, type ContentStore, type PostRow, type SectionRow } from '@/server/content/import';
import { loadContent } from '@/server/content/load';

const content = loadContent(join(__dirname, '../../../content'));

/** In-memory stand-in for the database, keyed the way the real tables are. */
class MemoryStore implements ContentStore {
  sections = new Map<string, SectionRow & { id: string }>();
  posts = new Map<string, PostRow>();
  projects: unknown[] = [];
  profile: unknown = null;
  timeline: unknown[] = [];
  problems: unknown[] = [];

  async upsertSections(rows: SectionRow[]) {
    for (const r of rows) {
      const key = `${r.subject_id}/${r.slug}`;
      this.sections.set(key, { ...r, id: this.sections.get(key)?.id ?? `id-${key}` });
    }
    return new Map([...this.sections].map(([k, v]) => [k, v.id]));
  }
  async publishedAt() {
    return new Map([...this.posts].map(([slug, p]) => [slug, p.published_at]));
  }
  async upsertPosts(rows: PostRow[]) {
    for (const r of rows) this.posts.set(r.slug, r);
  }
  async replaceProjects(rows: unknown[]) {
    this.projects = rows;
  }
  async upsertProfile(row: unknown) {
    this.profile = row;
  }
  async replaceTimeline(rows: unknown[]) {
    this.timeline = rows;
  }
  async replaceFeaturedProblems(rows: unknown[]) {
    this.problems = rows;
  }
  async hasSiteContent() {
    return this.projects.length > 0 || this.profile !== null || this.timeline.length > 0 || this.problems.length > 0;
  }
}

const FIRST = new Date('2026-10-16T08:00:00Z');
const LATER = new Date('2026-10-20T08:00:00Z');

describe('importContent', () => {
  it('publishes every post with rendered live fields and a resolved section', async () => {
    const store = new MemoryStore();
    const report = await importContent(content, store, FIRST);

    expect(report.posts).toBe(11);
    const amgm = store.posts.get('am-gm-inequality')!;
    expect(amgm).toMatchObject({
      kind: 'lesson',
      subject_id: 'math',
      section_id: 'id-math/inequalities',
      status: 'published',
      title: 'The AM–GM inequality',
      live_title: 'The AM–GM inequality',
      level: 1,
      problem_count: 3,
      live_has_math: true,
      live_has_code: false,
      published_at: FIRST.toISOString(),
      live_updated_at: FIRST.toISOString(),
    });
    expect(amgm.live_html).toContain('class="katex"');
    expect(amgm.live_toc).toEqual(expect.arrayContaining([{ id: 'proof', text: 'Proof', level: 2 }]));
    expect(amgm.content_json).toMatchObject({ type: 'doc' });
    expect(amgm.minutes).toBeGreaterThanOrEqual(1);

    const life = store.posts.get('why-i-started-codingspace')!;
    expect(life).toMatchObject({ kind: 'life', subject_id: null, section_id: null });
  });

  it('keeps the first publish date when importing again', async () => {
    const store = new MemoryStore();
    await importContent(content, store, FIRST);
    await importContent(content, store, LATER);
    expect(store.posts.get('am-gm-inequality')).toMatchObject({
      published_at: FIRST.toISOString(),
      live_updated_at: LATER.toISOString(),
    });
    expect(store.sections.size).toBe(14);
  });

  it('renders Khmer posts with lang km', async () => {
    const store = new MemoryStore();
    await importContent(content, store, FIRST);
    expect(store.posts.get('study-tips-km')).toMatchObject({ lang: 'km' });
  });

  it('writes projects, profile, timeline and featured problems in database shape', async () => {
    const store = new MemoryStore();
    const report = await importContent(content, store, FIRST);
    expect(store.projects).toHaveLength(3);
    expect(store.projects[0]).toMatchObject({
      slug: 'pseudocode-runner',
      landing_url: null, // its page is here (v1.1); no website of its own
      is_featured: true,
      subject_id: 'coding',
      platforms: ['Windows', 'macOS'],
      version: '0.9.0',
      source_url: 'https://example.com/source/pseudocode-runner',
    });
    const runner = store.projects[0] as { features: unknown[]; downloads: unknown[] };
    expect(runner.features).toHaveLength(4);
    expect(runner.downloads[0]).toEqual({
      label: 'Windows',
      url: 'https://example.com/downloads/pseudocode-runner-setup.exe',
    });
    expect(store.projects[1]).toMatchObject({ tagline: expect.stringContaining('inequality'), downloads: [] });
    expect(store.profile).toMatchObject({ id: true, name: 'CodingSpace', years: 8, students: 500 });
    expect(store.timeline).toHaveLength(4);
    expect(store.problems).toEqual([
      expect.objectContaining({
        subject_id: 'math',
        section_id: 'id-math/inequalities',
        week_of: '2026-10-12',
        is_current: true,
      }),
    ]);
    expect(report).toMatchObject({
      sections: 14,
      projects: 3,
      timeline: 4,
      featuredProblems: 1,
      siteContent: 'imported',
    });
  });

  it('keeps site content edited in the admin when importing again, unless told to replace it', async () => {
    const store = new MemoryStore();
    await importContent(content, store, FIRST);
    store.projects = [{ slug: 'edited-in-admin' }];
    expect(await importContent(content, store, LATER)).toMatchObject({ siteContent: 'kept' });
    expect(store.projects).toEqual([{ slug: 'edited-in-admin' }]);
    expect(store.posts.size).toBeGreaterThan(0);

    expect(await importContent(content, store, LATER, { replaceSiteContent: true })).toMatchObject({
      siteContent: 'imported',
    });
    expect(store.projects).toHaveLength(3);
  });

  it('lists published posts that are no longer in content/ without deleting them', async () => {
    const store = new MemoryStore();
    store.posts.set('old-lesson', { slug: 'old-lesson', published_at: FIRST.toISOString() } as PostRow);
    const report = await importContent(content, store, LATER);
    expect(report.notInContent).toEqual(['old-lesson']);
    expect(store.posts.has('old-lesson')).toBe(true);
  });
});
