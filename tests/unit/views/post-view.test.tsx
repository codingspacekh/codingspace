import { render, screen, within } from '@testing-library/react';
import { UiRoot } from '@/ui';
import { PostView } from '@/views/post-view';
import type { PostPageData } from '@/server/data/types';

const base: PostPageData = {
  post: {
    slug: 'am-gm-inequality',
    kind: 'lesson',
    title: 'The AM–GM inequality',
    summary: 'Means and their order.',
    html: '<h2 id="proof">Proof</h2><p>Body text.</p>',
    toc: [{ id: 'proof', text: 'Proof', level: 2 }],
    subject: 'math',
    level: 1,
    lang: 'en',
    minutes: 4,
    problemCount: 3,
    hasMath: true,
    publishedAt: '2026-10-12T00:00:00Z',
    updatedAt: '2026-10-12T00:00:00Z',
  },
  section: { slug: 'inequalities', title: 'Inequalities' },
  siblings: [
    { slug: 'am-gm-inequality', title: 'The AM–GM inequality' },
    { slug: 'cauchy-schwarz-inequality', title: 'The Cauchy–Schwarz inequality' },
  ],
};

const renderPost = (data: PostPageData) =>
  render(
    <UiRoot motion={false}>
      <PostView {...data} />
    </UiRoot>,
  );

describe('<PostView>', () => {
  it('shows breadcrumbs back to the subject and section', () => {
    renderPost(base);
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Math' })).toHaveAttribute('href', '/study/math');
    expect(within(crumbs).getByRole('link', { name: 'Inequalities' })).toHaveAttribute(
      'href',
      '/study/math#inequalities',
    );
  });

  it('shows the title, level and meta line', () => {
    renderPost(base);
    expect(screen.getByRole('heading', { level: 1, name: 'The AM–GM inequality' })).toBeVisible();
    expect(screen.getByText('Beginner')).toBeVisible();
    expect(screen.getByText('Published 12 Oct 2026 · 4 min read · 3 practice problems')).toBeVisible();
  });

  it('renders the stored lesson HTML and a table of contents', () => {
    renderPost(base);
    const article = screen.getByRole('article');
    expect(within(article).getByRole('heading', { level: 2, name: 'Proof' })).toHaveAttribute('id', 'proof');
    const toc = screen.getByRole('navigation', { name: 'On this page' });
    expect(within(toc).getByRole('link', { name: 'Proof' })).toHaveAttribute('href', '#proof');
  });

  it('links to the next lesson in the section', () => {
    renderPost(base);
    const pager = screen.getByRole('navigation', { name: 'More lessons in this section' });
    expect(within(pager).getByRole('link', { name: /next.*cauchy–schwarz/i })).toHaveAttribute(
      'href',
      '/posts/cauchy-schwarz-inequality',
    );
    expect(within(pager).queryByRole('link', { name: /previous/i })).toBeNull();
  });

  it('lists the section lessons and marks the current one', () => {
    renderPost(base);
    const side = screen.getByRole('navigation', { name: 'Inequalities lessons' });
    expect(within(side).getByRole('link', { name: 'The AM–GM inequality' })).toHaveAttribute('aria-current', 'page');
  });

  it('marks Khmer posts with lang="km"', () => {
    renderPost({
      post: { ...base.post, kind: 'life', subject: null, lang: 'km', title: 'គន្លឹះសិក្សា', toc: [] },
      section: null,
      siblings: [],
    });
    expect(screen.getByRole('article')).toHaveAttribute('lang', 'km');
  });

  it('puts life posts under the Author page', () => {
    renderPost({ post: { ...base.post, kind: 'life', subject: null }, section: null, siblings: [] });
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Author' })).toHaveAttribute('href', '/author');
    expect(screen.queryByText('Beginner')).toBeNull();
  });
});
