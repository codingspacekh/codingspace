import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fileKey, mediaUrl } from '@/lib/media-urls';
import { PAGE_SECTIONS } from '@/lib/project-page';
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
const MEDIA = '41000000-0000-4000-8000-000000000001';
const SHA = 'c'.repeat(64);

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36';
const visitor = (ua: string) => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
afterEach(() => vi.restoreAllMocks());

const full = (): ProjectPageData => ({
  project: {
    slug: 'easymedia',
    name: 'EasyMedia',
    glyph: '▶',
    subject: 'coding',
    tag: 'Desktop app',
    description: 'A video and audio editor.',
    platforms: ['Windows 11', 'macOS 12+'],
    landingUrl: 'https://easymedia.example',
    featured: false,
    available: true,
  },
  tagline: 'One small editor for Chapter 11.',
  introHtml: '<p>Made for <strong>students</strong>.</p>',
  reasons: [{ title: 'One window', text: 'Video, audio and theory.' }],
  features: [{ glyph: '⌁', title: 'Works offline', text: '' }],
  steps: [
    { title: 'Open the installer', text: '', platform: 'windows' },
    { title: 'Drag to Applications', text: '', platform: 'mac' },
    { title: 'Open EasyMedia', text: 'From the Start menu or Applications.' },
  ],
  faq: [{ question: 'Is it free?', answerHtml: '<p>Yes.</p>' }],
  downloads: [
    {
      label: 'Windows',
      note: 'Installer',
      platform: 'windows',
      media: MEDIA,
      name: 'Setup.exe',
      bytes: 183_500_800,
      sha256: SHA,
    },
    { label: 'Mac with Apple chip', platform: 'mac-arm', url: 'https://github.com/x/easymedia/releases/arm64.dmg' },
    { label: 'Mac with Intel', platform: 'mac-intel', url: 'https://github.com/x/easymedia/releases/x64.dmg' },
  ],
  version: '0.11.0',
  sourceUrl: 'https://github.com/x/easymedia',
  screenshots: [shot(1, 'Video mode'), shot(2)],
  hasMath: false,
  sections: [...PAGE_SECTIONS],
  highlights: [{ value: '4 GB', label: 'of RAM is enough' }],
  whyTitle: 'Chapter 11 used to need five programs',
  whyText: 'DaVinci needs a strong GPU.',
  replaces: [{ name: 'DaVinci Resolve', note: 'needs a strong GPU' }],
  requirements: [
    { part: 'Memory', minimum: '4 GB', recommended: '8 GB' },
    { part: 'Screen', minimum: '1366 × 768', recommended: '' },
  ],
  requirementsNote: 'If it runs Windows 11, it meets the minimum.',
  releaseDate: '2026-10-19',
  releaseNotes: ['Learn mode', '33 transitions'],
  showcase: [
    {
      ...shot(3),
      label: 'Video mode · 11.1',
      title: 'Trim and join',
      text: 'Exact times.',
      points: [
        { code: 'V4', text: 'Captions' },
        { code: '', text: 'Snapshots' },
      ],
      color: 'lime',
    },
  ],
});

const h2s = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

describe('<ProjectPage> (v1.1, redesigned 2026-10-20)', () => {
  it('shows the hero and every section in order, with a sub-navigation and a closing call', () => {
    render(<ProjectPage {...full()} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('EasyMedia');
    expect(screen.getByText('students').tagName).toBe('STRONG');
    expect(h2s()).toEqual([
      'Chapter 11 used to need five programs',
      'What EasyMedia does',
      'Features',
      'Screenshots',
      'System requirements',
      'Get EasyMedia',
      'Install',
      'Questions',
      'Ready to try EasyMedia?',
    ]);
    const nav = screen.getByRole('navigation', { name: 'EasyMedia: on this page' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual([
      'Numbers',
      'Why',
      'Showcase',
      'Features',
      'Screenshots',
      'Requirements',
      'Download',
      'Install',
      'Questions',
      'Download',
    ]);
    expect(screen.getByRole('region', { name: 'At a glance' })).toHaveTextContent('4 GBof RAM is enough');
    expect(screen.getByRole('link', { name: 'Source code ↗' })).toHaveAttribute(
      'href',
      'https://github.com/x/easymedia',
    );
    expect(screen.getByRole('link', { name: /Website ↗/ })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('list', { name: 'Runs on' })).toHaveTextContent('Windows 11macOS 12+');
    const images = screen.getAllByRole('img');
    expect(images[0]).toHaveAttribute('loading', 'eager');
    expect(images[0]).toHaveAttribute('alt', 'Video mode');
  });

  it('before the browser is known, the hero offers the first download, with its version, note and size', () => {
    render(<ProjectPage {...full()} />);
    const [hero] = screen.getAllByRole('link', { name: /^Download for Windows/ });
    expect(hero).toHaveAttribute('href', mediaUrl(fileKey(MEDIA)));
    expect(hero).toHaveTextContent('v0.11.0 · Installer · 175.0 MB');
  });

  it('on a Mac, the hero, the cards and the install tabs pick the Mac', () => {
    visitor(MAC);
    render(<ProjectPage {...full()} />);
    expect(screen.getAllByRole('link', { name: /^Download for Mac with Apple chip/ })[0]).toHaveAttribute(
      'href',
      'https://github.com/x/easymedia/releases/arm64.dmg',
    );
    const download = screen.getByRole('region', { name: 'Get EasyMedia' });
    const cards = within(download)
      .getAllByRole('listitem')
      .filter((li) => li.classList.contains('pj-dl'));
    expect(cards[1]).toHaveTextContent('Your computer');
    expect(cards[0]).not.toHaveTextContent('Your computer');
    expect(screen.getByRole('tab', { name: 'macOS' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Drag to Applications');
  });

  it('the Download section: version, date, a card per file with size and checksum, notes and the Mac question', async () => {
    visitor(WINDOWS);
    render(<ProjectPage {...full()} />);
    const download = screen.getByRole('region', { name: 'Get EasyMedia' });
    expect(within(download).getByText('Version 0.11.0')).toBeInTheDocument();
    expect(within(download).getByText('Released 19 Oct 2026')).toBeInTheDocument();
    const exe = within(download).getByRole('link', { name: 'Download .exe for Windows' });
    expect(exe).toHaveAttribute('href', mediaUrl(fileKey(MEDIA)));
    expect(exe).toHaveClass('pri');
    expect(within(download).getAllByText('github.com', { selector: '.pj-dl-file' })).toHaveLength(2); // links show their site
    expect(within(download).getByText(SHA)).toBeInTheDocument();
    const user = userEvent.setup(); // gives jsdom a clipboard
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    await user.click(within(download).getByRole('button', { name: 'Copy the SHA-256 checksum' }));
    expect(writeText).toHaveBeenCalledWith(SHA);
    expect(await within(download).findByText('Copied')).toBeInTheDocument();
    expect(within(download).getByRole('heading', { name: 'What’s new in 0.11.0' })).toBeInTheDocument();
    expect(within(download).getByText('33 transitions')).toBeInTheDocument();
    expect(within(download).getByRole('heading', { name: 'Which Mac do I have?' })).toBeInTheDocument();
  });

  it('Why: the Before list beside the reasons as Now', () => {
    render(<ProjectPage {...full()} />);
    const why = screen.getByRole('region', { name: 'Chapter 11 used to need five programs' });
    expect(why).toHaveTextContent('DaVinci needs a strong GPU.');
    expect(why).toHaveTextContent('BeforeDaVinci Resolveneeds a strong GPU');
    expect(why).toHaveTextContent('One window Video, audio and theory.');
  });

  it('Why without a Before list: the reasons as cards, under the default heading', () => {
    render(<ProjectPage {...full()} replaces={[]} whyTitle="" />);
    const why = screen.getByRole('region', { name: 'Why EasyMedia?' });
    expect(within(why).getByRole('heading', { level: 3, name: 'One window' })).toBeInTheDocument();
  });

  it('a showcase row: label, title, text, points with their codes', () => {
    const { container } = render(<ProjectPage {...full()} />);
    const row = container.querySelector('.pj-row')!;
    expect(row).toHaveClass('c-lime');
    expect(row).toHaveTextContent('Video mode · 11.1');
    expect(within(row as HTMLElement).getByText('V4').tagName).toBe('CODE');
    expect(row).toHaveTextContent('Snapshots');
  });

  it('requirements: one column when nothing has a recommended value', () => {
    render(<ProjectPage {...full()} />);
    const table = screen.getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['Minimum', 'Recommended']);
    expect(within(table).getByRole('row', { name: /Screen/ })).toHaveTextContent('Screen1366 × 768—');
    render(<ProjectPage {...full()} requirements={[{ part: 'Memory', minimum: '4 GB', recommended: '' }]} />);
    expect(within(screen.getAllByRole('table')[1]!).getAllByRole('columnheader')).toHaveLength(1);
  });

  it('the owner’s order and hidden sections; an empty section doesn’t show', () => {
    render(<ProjectPage {...full()} sections={['faq', 'download', 'why']} showcase={[]} screenshots={[shot(1)]} />);
    expect(h2s()).toEqual([
      'Questions',
      'Get EasyMedia',
      'Chapter 11 used to need five programs',
      'Ready to try EasyMedia?',
    ]);
  });

  it('steps without computers are one list, without tabs', () => {
    render(<ProjectPage {...full()} steps={[{ title: 'Unzip it', text: '' }]} />);
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByRole('region', { name: 'Install' })).toHaveTextContent('01Unzip it');
  });

  it('a project with only a name and description: no empty sections, “Coming soon”', () => {
    const page = full();
    render(
      <ProjectPage
        {...page}
        project={{ ...page.project, landingUrl: null, platforms: [], available: false, tag: '', subject: null }}
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
        highlights={[]}
        replaces={[]}
        requirements={[]}
        releaseNotes={[]}
        showcase={[]}
      />,
    );
    expect(screen.getByText('A video and audio editor.', { selector: '.lead' })).toBeInTheDocument();
    expect(h2s()).toEqual(['EasyMedia is coming soon', 'EasyMedia']);
    expect(screen.getByText('Coming soon')).toHaveClass('tag-soon');
    expect(screen.queryByRole('navigation', { name: /on this page/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Download/ })).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
