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
  series: [],
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

  it('marks Khmer posts with lang="km", table of contents included', () => {
    renderPost({
      post: {
        ...base.post,
        kind: 'life',
        subject: null,
        lang: 'km',
        title: 'គន្លឹះសិក្សា',
        toc: [{ id: 'រៀនរាល់ថ្ងៃ', text: 'រៀនរាល់ថ្ងៃ', level: 2 }],
      },
      section: null,
      siblings: [],
      series: [],
    });
    expect(screen.getByRole('article')).toHaveAttribute('lang', 'km');
    // The TOC sits outside the article, so its Khmer links need their own lang.
    const toc = screen.getByRole('navigation', { name: 'On this page' });
    expect(within(toc).getByRole('link', { name: 'រៀនរាល់ថ្ងៃ' })).toHaveAttribute('lang', 'km');
  });

  it('shows its place in each series, with neighbours from other subjects (v1.1)', () => {
    renderPost({
      ...base,
      series: [
        {
          slug: 'maths-for-physics',
          title: 'Maths for Physics',
          position: 2,
          total: 3,
          prev: { slug: 'vectors', title: 'Vectors', subject: 'math' },
          next: { slug: 'projectile-motion', title: 'Projectile motion', subject: 'physics' },
        },
        { slug: 'olympiad-start', title: 'Olympiad start', position: 1, total: 1, prev: null, next: null },
      ],
    });
    expect(screen.getByText(/Part 2 of 3 in the series/)).toBeInTheDocument();
    const box = screen.getByRole('navigation', { name: 'Series: Maths for Physics' });
    expect(within(box).getByText('Series · Part 2 of 3')).toBeInTheDocument();
    expect(within(box).getByRole('link', { name: 'Maths for Physics' })).toHaveAttribute(
      'href',
      '/series/maths-for-physics',
    );
    expect(within(box).getByRole('link', { name: /Previous · Math Vectors/ })).toHaveAttribute(
      'href',
      '/posts/vectors',
    );
    expect(within(box).getByRole('link', { name: /Next → · Physics Projectile motion/ })).toHaveAttribute(
      'href',
      '/posts/projectile-motion',
    );
    // A one-lesson series has no previous/next.
    const single = screen.getByRole('navigation', { name: 'Series: Olympiad start' });
    expect(within(single).getAllByRole('link')).toHaveLength(1);
  });

  it('puts life posts under the Author page', () => {
    renderPost({ post: { ...base.post, kind: 'life', subject: null }, section: null, siblings: [], series: [] });
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Author' })).toHaveAttribute('href', '/author');
    expect(screen.queryByText('Beginner')).toBeNull();
  });
});

describe('save for later', () => {
  it('saves the lesson in this browser and links to the saved list', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const { getSaved } = await import('@/ui/saved-store');
    renderPost(base);
    await userEvent.click(screen.getByRole('button', { name: '☆ Save' }));
    const saved = screen.getByRole('button', { name: '★ Saved' });
    expect(saved).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: 'Your saved lessons' })).toHaveAttribute('href', '/saved');
    expect(getSaved()).toMatchObject([{ slug: 'am-gm-inequality', title: 'The AM–GM inequality', subject: 'math' }]);
    await userEvent.click(saved);
    expect(getSaved()).toEqual([]);
    expect(screen.getByRole('button', { name: '☆ Save' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('reading mode and print (PUB-11)', () => {
  it('reading mode is a remembered toggle that calms the page', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    renderPost(base);
    const toggle = screen.getByRole('button', { name: 'Reading mode off' });
    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Reading mode on' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.dataset.reading).toBe('on');
    expect(JSON.parse(window.localStorage.getItem('cs-prefs')!)).toMatchObject({ reading: true });
  });

  it('Print opens the browser print dialog', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderPost(base);
    await userEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });

  it('printing opens hints and solutions, and closes them again afterwards', () => {
    renderPost({
      ...base,
      post: { ...base.post, html: '<details><summary>Show the solution</summary><p>x = 2</p></details>' },
    });
    const details = document.querySelector('.prose details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    window.dispatchEvent(new Event('beforeprint'));
    expect(details.open).toBe(true);
    window.dispatchEvent(new Event('afterprint'));
    expect(details.open).toBe(false);
  });
});
