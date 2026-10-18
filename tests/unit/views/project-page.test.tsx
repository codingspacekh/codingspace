import { screen, within } from '@testing-library/react';
import type { ProjectPageData } from '@/server/data/types';
import { ProjectPage } from '@/views/project-page';
import { render } from '../../support/subjects';

const shot = (n: number, caption = '') => ({
  media: `40000000-0000-4000-8000-00000000000${n}`,
  caption,
  alt: '',
  widths: [480, 960],
  width: 960,
  height: 540,
});

const full = (): ProjectPageData => ({
  project: {
    slug: 'easy-media',
    name: 'Easy Media',
    glyph: '▶',
    subject: 'coding',
    tag: 'Tool',
    description: 'Cut and convert videos.',
    platforms: ['Windows', 'macOS'],
    landingUrl: 'https://easymedia.example',
    featured: false,
    available: true,
  },
  tagline: 'Video editing for class projects.',
  introHtml: '<p>Made for <strong>students</strong>.</p>',
  reasons: [{ title: 'Free', text: 'No ads.' }],
  features: [
    { glyph: '✂', title: 'Trim', text: 'Cut the start and end.' },
    { glyph: '', title: 'Convert', text: '' },
  ],
  steps: [
    { title: 'Download', text: 'Get the installer.' },
    { title: 'Open a video', text: '' },
  ],
  faq: [{ question: 'Is it free?', answerHtml: '<p>Yes.</p>' }],
  downloads: [
    { label: 'Windows', url: 'https://github.com/x/easy-media/releases/download/v1.0.0/setup.exe' },
    { label: 'macOS', url: 'https://github.com/x/easy-media/releases/download/v1.0.0/EasyMedia.dmg' },
  ],
  version: '1.0.0',
  sourceUrl: 'https://github.com/x/easy-media',
  screenshots: [shot(1, 'Trimming a clip'), shot(2)],
  hasMath: false,
});

describe('<ProjectPage> (v1.1)', () => {
  it('shows every section in order, with downloads, links and screenshots', () => {
    render(<ProjectPage {...full()} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Easy Media');
    expect(screen.getByText('Video editing for class projects.')).toBeInTheDocument();
    expect(screen.getByText('students').tagName).toBe('STRONG');
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Screenshots',
      'Why Easy Media?',
      'Features',
      'Get started',
      'Questions',
      'Get Easy Media',
    ]);
    expect(screen.getByRole('article')).toHaveClass('c-amber');
    // Two downloads: the hero's button goes to the Download section, which has one per file.
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute('href', '#download');
    const get = screen.getByRole('region', { name: 'Get Easy Media' });
    expect(within(get).getByText('Free, version 1.0.0, for Windows, macOS.')).toBeInTheDocument();
    expect(within(get).getByRole('link', { name: 'Download for macOS' })).toHaveAttribute(
      'href',
      'https://github.com/x/easy-media/releases/download/v1.0.0/EasyMedia.dmg',
    );
    expect(screen.getByRole('link', { name: 'Source code' })).toHaveAttribute(
      'href',
      'https://github.com/x/easy-media',
    );
    expect(screen.getByRole('link', { name: /Website ↗/ })).toHaveAttribute('target', '_blank');
    // The first screenshot is in the hero (loaded at once); the gallery lazy-loads.
    const images = screen.getAllByRole('img');
    expect(images[0]).toHaveAttribute('loading', 'eager');
    expect(images[0]).toHaveAttribute('alt', 'Trimming a clip');
    expect(screen.getByText('Is it free?').closest('details')).not.toHaveAttribute('open');
  });

  it('with one download, the hero button downloads it directly', () => {
    render(<ProjectPage {...full()} downloads={[full().downloads[0]!]} />);
    const buttons = screen.getAllByRole('link', { name: 'Download for Windows' });
    expect(buttons).toHaveLength(2); // hero and the Download section
    expect(buttons[0]).toHaveClass('pri');
  });

  it('a project with only a name and description: no empty sections, “Coming soon”', () => {
    const page = full();
    render(
      <ProjectPage
        {...page}
        project={{ ...page.project, landingUrl: null, platforms: [], available: false }}
        tagline=""
        introHtml=""
        reasons={[]}
        features={[]}
        steps={[]}
        faq={[]}
        downloads={[]}
        version=""
        sourceUrl={null}
        screenshots={[]}
      />,
    );
    expect(screen.getByText('Cut and convert videos.')).toBeInTheDocument(); // the description stands in
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Easy Media is coming soon',
    ]);
    expect(screen.getAllByText('Coming soon')).toHaveLength(2);
    expect(screen.queryByRole('link', { name: /Download/ })).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('a single screenshot stays in the hero, without a Screenshots section', () => {
    render(<ProjectPage {...full()} screenshots={[shot(1)]} />);
    expect(screen.queryByRole('heading', { name: 'Screenshots' })).toBeNull();
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Screenshot');
  });
});
