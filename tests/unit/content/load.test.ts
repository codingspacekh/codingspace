import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ContentError, loadContent } from '@/server/content/load';
import { renderContent } from '@/server/render';
import { findUnsafe } from '../render/assert-safe';

const REPO_CONTENT = join(__dirname, '../../../content');

// ---------- the real content/ folder (doubles as a content lint in CI) ----------

describe('loadContent: content/ folder', () => {
  const content = loadContent(REPO_CONTENT);

  it('loads every file without errors', () => {
    expect(content.posts.filter((p) => p.kind === 'lesson')).toHaveLength(9);
    expect(content.posts.filter((p) => p.kind === 'life')).toHaveLength(2);
    expect(content.sections).toHaveLength(14);
    expect(content.projects).toHaveLength(3);
    expect(content.profile.name).toBe('CodingSpace');
  });

  it('has two lessons in Inequalities, in order, for the Next-lesson E2E', () => {
    const inequalities = content.posts
      .filter((p) => p.section === 'inequalities')
      .sort((a, b) => a.sort - b.sort)
      .map((p) => p.slug);
    expect(inequalities).toEqual(['am-gm-inequality', 'cauchy-schwarz-inequality']);
  });

  it('reads Khmer posts with lang km', () => {
    expect(content.posts.find((p) => p.slug === 'study-tips-km')?.lang).toBe('km');
  });

  it('counts problems under a "Problems" heading', () => {
    expect(content.posts.find((p) => p.slug === 'am-gm-inequality')?.problemCount).toBe(3);
  });

  it('renders every post to safe HTML', async () => {
    for (const post of content.posts) {
      const { html } = await renderContent(post.doc, { lang: post.lang });
      expect(findUnsafe(html), post.slug).toEqual([]);
      expect(html.length, post.slug).toBeGreaterThan(0);
    }
  });

  it('reports the dummy files', () => {
    expect(content.dummyFiles).toBe(15); // 11 posts + 4 JSON files
  });
});

// ---------- invalid content: all problems reported, with file names ----------

const VALID_SECTIONS = { sections: [{ subject: 'math', slug: 'inequalities', title: 'Inequalities', sort: 1 }] };
const VALID_PROFILE = { name: 'X', bio: 'y', timeline: [] };

function fixture(files: Record<string, string | object>): string {
  const dir = mkdtempSync(join(tmpdir(), 'content-'));
  const all: Record<string, string | object> = {
    'sections.json': VALID_SECTIONS,
    'projects.json': { projects: [] },
    'profile.json': VALID_PROFILE,
    'featured-problems.json': { problems: [] },
    ...files,
  };
  for (const [path, body] of Object.entries(all)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), typeof body === 'string' ? body : JSON.stringify(body));
  }
  return dir;
}

const post = (front: string, body = 'Text.') => `---\n${front}\n---\n\n${body}\n`;

function errorsOf(dir: string): string[] {
  try {
    loadContent(dir);
  } catch (e) {
    if (e instanceof ContentError) return e.problems;
    throw e;
  }
  return [];
}

describe('loadContent: validation', () => {
  it('accepts a minimal valid lesson', () => {
    const dir = fixture({ 'posts/math/ok.md': post('title: OK\nsummary: s\nsection: inequalities') });
    const [lesson] = loadContent(dir).posts;
    expect(lesson).toMatchObject({ slug: 'ok', kind: 'lesson', subject: 'math', sort: 0, level: 1, lang: 'en' });
  });

  it('reports every problem at once, each with its file', () => {
    const problems = errorsOf(
      fixture({
        'posts/math/no-title.md': post('summary: s\nsection: inequalities'),
        'posts/math/bad-section.md': post('title: T\nsection: algebra'),
        'posts/math/Bad_Slug.md': post('title: T\nsection: inequalities'),
        'posts/math/bad-level.md': post('title: T\nsection: inequalities\nlevel: 5'),
        'posts/math/bad-lang.md': post('title: T\nsection: inequalities\nlang: fr'),
        'posts/art/x.md': post('title: T'),
        'posts/math/no-front-matter.md': 'Just text.',
        'posts/math/broken-yaml.md': post('title: [unclosed'),
      }),
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^posts\/math\/no-title\.md: title is required/),
        expect.stringMatching(/^posts\/math\/bad-section\.md: section "algebra" does not exist in math/),
        expect.stringMatching(/^posts\/math\/Bad_Slug\.md: file name must be a slug/),
        expect.stringMatching(/^posts\/math\/bad-level\.md: level must be 1, 2 or 3/),
        expect.stringMatching(/^posts\/math\/bad-lang\.md: lang must be en or km/),
        expect.stringMatching(/^posts\/art\/x\.md: folder must be math, physics, coding, it or life/),
        expect.stringMatching(/^posts\/math\/no-front-matter\.md: missing front matter/),
        expect.stringMatching(/^posts\/math\/broken-yaml\.md: invalid front matter/),
      ]),
    );
    expect(problems).toHaveLength(8);
  });

  it('rejects a lesson without a section and a life post with one', () => {
    const problems = errorsOf(
      fixture({
        'posts/math/orphan.md': post('title: T'),
        'posts/life/sectioned.md': post('title: T\nsection: inequalities'),
      }),
    );
    expect(problems).toEqual([
      'posts/life/sectioned.md: life posts have no section',
      'posts/math/orphan.md: section is required for lessons',
    ]);
  });

  it('rejects duplicate slugs across subjects', () => {
    const problems = errorsOf(
      fixture({
        'sections.json': {
          sections: [...VALID_SECTIONS.sections, { subject: 'physics', slug: 'waves', title: 'Waves', sort: 1 }],
        },
        'posts/math/same.md': post('title: A\nsection: inequalities'),
        'posts/physics/same.md': post('title: B\nsection: waves'),
      }),
    );
    expect(problems).toEqual(['posts/physics/same.md: slug "same" is already used by posts/math/same.md']);
  });

  it('checks projects, sections and featured problems', () => {
    const problems = errorsOf(
      fixture({
        'sections.json': { sections: [{ subject: 'art', slug: 'x', title: 'X' }] },
        'projects.json': {
          projects: [
            { slug: 'a', name: 'A', description: 'd', landingUrl: 'http://example.com', featured: true },
            { slug: 'b', name: 'B', description: 'd', landingUrl: 'https://example.com', featured: true },
          ],
        },
        'featured-problems.json': { problems: [{ subject: 'math', weekOf: 'soon', statement: 's', current: true }] },
      }),
    );
    expect(problems).toEqual([
      'featured-problems.json: problem 1: weekOf must be a date (YYYY-MM-DD)',
      'projects.json: only one project can be featured',
      'projects.json: project "a": landingUrl must start with https://',
      'sections.json: section "x": subject must be math, physics, coding or it',
    ]);
  });

  it('checks a project’s page: lists with their first field, https links (v1.1)', () => {
    const problems = errorsOf(
      fixture({
        'projects.json': {
          projects: [
            { slug: 'a', name: 'A', description: 'd' }, // no website: fine
            {
              slug: 'b',
              name: 'B',
              description: 'd',
              page: {
                reasons: [{ text: 'no title' }],
                downloads: [{ label: 'Windows', url: 'http://example.com/b.exe' }],
                sourceUrl: 'ftp://example.com',
              },
            },
          ],
        },
      }),
    );
    expect(problems).toEqual([
      'projects.json: project "b": every download url must start with https://',
      'projects.json: project "b": page.reasons must be at most 8 items, each with title',
      'projects.json: project "b": page.sourceUrl must start with https://',
    ]);
  });

  it('reports Markdown that cannot be converted, with the line in the file', () => {
    const problems = errorsOf(
      fixture({ 'posts/math/html.md': post('title: T\nsection: inequalities', '<iframe src="x"></iframe>') }),
    );
    expect(problems).toEqual(['posts/math/html.md: raw HTML is not supported and was removed (line 6)']);
  });
});
