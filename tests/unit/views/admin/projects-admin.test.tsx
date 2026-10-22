import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectsAdmin } from '@/views/admin/projects-admin';
import { render } from '../../../support/subjects';

const project = (id: string, name: string, extra = {}) => ({
  id,
  slug: id,
  name,
  glyph: '',
  subject_id: null,
  tag: '',
  description: `${name} description`,
  platforms: [],
  landing_url: null,
  coming_soon: false,
  is_featured: false,
  sort: 1,
  tagline: '',
  intro: '',
  reasons: [],
  features: [],
  steps: [],
  faq: [],
  downloads: [],
  version: '',
  source_url: null,
  screenshots: [],
  highlights: [],
  why_title: '',
  why_text: '',
  replaces: [],
  requirements: [],
  requirements_note: '',
  release_date: null,
  release_notes: '',
  section_order: [],
  hidden_sections: [],
  showcase: [],
  ...extra,
});
const projects = () => [
  project('quiz', 'Quiz', {
    is_featured: true,
    coming_soon: true,
    subject_id: 'coding',
    tag: 'Web app',
    platforms: ['Web'],
  }),
  project('sim', 'Simulator', {
    landing_url: 'https://sim.example',
    features: [{ glyph: '⚡', title: 'Fast', text: '' }],
    downloads: [{ label: 'Windows', url: 'https://github.com/x/sim/releases/download/v1/sim.exe' }],
    version: '1.0',
    screenshots: [{ media_id: '40000000-0000-4000-8000-000000000001', caption: 'Main', widths: [320, 960] }],
  }),
];

type Call = { url: string; method: string; body: unknown };
function mockApi(reply: (c: Call) => [number, unknown] = () => [200, { ok: true }]) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined };
      if (call.method === 'GET') return new Response(JSON.stringify({ projects: projects() }), { status: 200 });
      calls.push(call);
      const [status, body] = reply(call);
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

/** The editor's list of the page's parts. */
const nav = (form: HTMLElement) => within(form).getByRole('navigation', { name: 'Page parts' });
/** A part's button in that list, by its name (its state, like "on", follows the name). */
const part = (form: HTMLElement, name: string) =>
  within(nav(form)).getByRole('button', { name: new RegExp(`^${name}\\b`) });
/** The sections' names, in the page's order. */
const sections = (form: HTMLElement) =>
  within(within(nav(form)).getByRole('list', { name: 'Sections, in the page’s order' }))
    .getAllByRole('button')
    .map((b) => b.firstChild?.textContent);

describe('projects admin (03 ADM-13)', () => {
  it('lists projects in order with the featured one marked', async () => {
    mockApi();
    render(<ProjectsAdmin />);
    const list = await screen.findByRole('list', { name: 'Projects, in order' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(/Quiz\s*Featured/);
    expect(items[0]).toHaveTextContent('Coding · Web app · Web');
    expect(within(items[0]!).getByRole('button', { name: 'Feature Quiz' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(items[0]!).getByRole('button', { name: 'Move Quiz up' })).toBeDisabled();
    // v1.1: each project has its own page here; a website of its own is optional.
    expect(within(items[0]!).getByRole('link', { name: '/projects/quiz' })).toHaveAttribute('href', '/projects/quiz');
    expect(items[0]).toHaveTextContent('Coming soon (no download links yet)');
    expect(items[1]).toHaveTextContent('1 screenshot · 1 feature · 1 download (version 1.0)');
    expect(within(items[1]!).getByRole('link', { name: 'https://sim.example' })).toBeInTheDocument();
  });

  it('adds a project, refusing an http website with the reason', async () => {
    const calls = mockApi(() => [201, { id: 'new' }]);
    render(<ProjectsAdmin />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '+ New project' }));
    const form = screen.getByRole('form', { name: 'Add a project' });
    expect(screen.getByRole('heading', { level: 1, name: 'New project' })).toHaveFocus();
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'Graph lab');
    await user.type(within(form).getByRole('textbox', { name: /Short description/ }), 'Plot functions.');
    const url = within(form).getByRole('textbox', { name: /Website/ });
    await user.type(url, 'http://graph.example');
    await user.click(within(form).getByRole('button', { name: 'Add project' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('must start with https://');
    expect(calls).toEqual([]);

    await user.clear(url);
    await user.type(url, 'https://graph.example');
    await user.type(within(form).getByRole('textbox', { name: /Platforms/ }), 'Web, Windows,');
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Subject' }), 'math');
    await user.click(within(form).getByRole('button', { name: 'Add project' }));
    await waitFor(() =>
      expect(calls[0]).toEqual({
        url: '/api/admin/projects',
        method: 'POST',
        body: {
          name: 'Graph lab',
          description: 'Plot functions.',
          landing_url: 'https://graph.example',
          subject_id: 'math',
          tag: '',
          glyph: '',
          platforms: ['Web', 'Windows'],
          tagline: '',
          intro: '',
          reasons: [],
          features: [],
          steps: [],
          faq: [],
          downloads: [],
          version: '',
          source_url: '',
          screenshots: [],
          highlights: [],
          why_title: '',
          why_text: '',
          replaces: [],
          requirements: [],
          requirements_note: '',
          release_date: '',
          release_notes: '',
          // A new project isn't "Coming soon" unless the owner says so (2026-10-23).
          coming_soon: false,
          section_order: [
            'numbers',
            'why',
            'showcase',
            'features',
            'screenshots',
            'requirements',
            'download',
            'install',
            'faq',
          ],
          hidden_sections: [],
          showcase: [],
        },
      }),
    );
    expect(await screen.findByText('Added “Graph lab” at the end.')).toBeInTheDocument();
    // Back to the list.
    expect(screen.queryByRole('form', { name: 'Add a project' })).toBeNull();
    expect(screen.getByRole('list', { name: 'Projects, in order' })).toBeInTheDocument();
  });

  it('features another project, moves one and deletes after confirming', async () => {
    const calls = mockApi();
    render(<ProjectsAdmin />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Feature Simulator' }));
    await user.click(screen.getByRole('button', { name: 'Move Simulator up' }));
    await user.click(screen.getByRole('button', { name: 'Delete Simulator' }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls.map((c) => [c.method, c.url, c.body])).toEqual([
      ['PUT', '/api/admin/projects/featured', { id: 'sim' }],
      ['PUT', '/api/admin/projects/order', { ids: ['sim', 'quiz'] }],
      ['DELETE', '/api/admin/projects/sim', undefined],
    ]);
  });

  it('edits a project in its own editor, which stays open after saving (2026-10-20)', async () => {
    const calls = mockApi();
    render(<ProjectsAdmin />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit Quiz' }));
    // The editor replaces the list.
    expect(screen.queryByRole('list', { name: 'Projects, in order' })).toBeNull();
    const form = screen.getByRole('form', { name: 'Edit Quiz' });
    expect(within(form).getByRole('heading', { level: 1 })).toHaveTextContent(/Quiz\s*Featured/);
    expect(within(form).getByRole('link', { name: /View page/ })).toHaveAttribute('href', '/projects/quiz');
    expect(part(form, 'Card')).toHaveAttribute('aria-current', 'true');
    expect(within(form).getByRole('textbox', { name: /Platforms/ })).toHaveValue('Web');
    await user.clear(within(form).getByRole('textbox', { name: 'Name' }));
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'Quiz 2');
    expect(within(form).getByRole('heading', { level: 1 })).toHaveTextContent('Quiz 2');
    await user.click(within(form).getByRole('button', { name: 'Save & update' }));
    await waitFor(() =>
      expect(calls[0]).toMatchObject({ method: 'PUT', url: '/api/admin/projects/quiz', body: { name: 'Quiz 2' } }),
    );
    expect(await screen.findByText('Saved “Quiz 2”.')).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Edit Quiz' })).toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: '← Projects' }));
    expect(screen.getByRole('list', { name: 'Projects, in order' })).toBeInTheDocument();
  });

  it('“Coming soon” is a choice in the Download part, shown as the part’s status (2026-10-23)', async () => {
    const calls = mockApi();
    render(<ProjectsAdmin />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit Simulator' }));
    const form = screen.getByRole('form', { name: 'Edit Simulator' });
    await user.click(part(form, 'Download'));
    const soon = within(form).getByRole('checkbox', { name: /^Coming soon/ });
    expect(soon).not.toBeChecked();
    await user.click(soon);
    await user.click(within(form).getByRole('button', { name: 'Save & update' }));
    await waitFor(() =>
      expect(calls[0]).toMatchObject({ method: 'PUT', url: '/api/admin/projects/sim', body: { coming_soon: true } }),
    );
  });

  it('says why a change was refused', async () => {
    mockApi(() => [422, { error: 'landing_url: The address must start with https://' }]);
    render(<ProjectsAdmin />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Feature Simulator' }));
    expect(await screen.findByText(/^Not done: landing_url/)).toHaveAttribute('role', 'status');
  });

  it('fills in the project’s page: reasons, a download link (https only) and an uploaded screenshot (v1.1)', async () => {
    const calls = mockApi();
    const upload = vi.fn(async () => ({
      id: '40000000-0000-4000-8000-000000000009',
      kind: 'image' as const,
      mime: 'image/png',
      bytes: 3,
      width: 960,
      height: 540,
      widths: [320, 960],
      alt: '',
      original_name: 'quiz.png',
    }));
    render(<ProjectsAdmin upload={upload} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit Quiz' }));
    const form = screen.getByRole('form', { name: 'Edit Quiz' });

    await user.click(part(form, 'Hero'));
    await user.type(within(form).getByRole('textbox', { name: /Tagline/ }), 'Quizzes in a minute.');

    await user.click(part(form, 'Why'));
    await user.click(within(form).getByRole('button', { name: 'Add a reason' }));
    await user.click(within(form).getByRole('button', { name: 'Add a reason' }));
    const reasons = within(form).getByRole('list', { name: 'Reasons' });
    await user.type(within(reasons).getAllByRole('textbox', { name: 'Title' })[0]!, 'Free');
    await user.type(within(reasons).getAllByRole('textbox', { name: 'Text' })[0]!, 'No ads.');
    // The second reason stays blank: it is dropped, not refused.

    await user.click(part(form, 'Download'));
    await user.click(within(form).getByRole('button', { name: 'Add a link' }));
    await user.type(within(form).getByRole('textbox', { name: /^Label/ }), 'Windows');
    const link = within(form).getByRole('textbox', { name: 'Link' });
    await user.type(link, 'http://example.com/quiz.exe');
    await user.click(within(form).getByRole('button', { name: 'Save & update' }));
    expect(within(form).getByRole('alert')).toHaveTextContent(
      'Download “Windows”: The address must start with https://',
    );
    expect(calls).toEqual([]);
    await user.clear(link);
    await user.type(link, 'https://github.com/x/quiz/releases/download/v1/quiz.exe');

    await user.click(part(form, 'Screenshots'));
    await user.upload(
      within(form).getByLabelText('Upload screenshots'),
      new File(['png'], 'quiz.png', { type: 'image/png' }),
    );
    expect(await within(form).findByText('“quiz.png” added. Save to show it on the page.')).toBeInTheDocument();
    await user.type(within(form).getByRole('textbox', { name: 'Caption (optional)' }), 'A quiz');

    await user.click(within(form).getByRole('button', { name: 'Save & update' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      method: 'PUT',
      url: '/api/admin/projects/quiz',
      body: {
        tagline: 'Quizzes in a minute.',
        reasons: [
          { title: 'Free', text: 'No ads.' },
          { title: '', text: '' },
        ],
        downloads: [
          { label: 'Windows', note: '', platform: '', url: 'https://github.com/x/quiz/releases/download/v1/quiz.exe' },
        ],
        screenshots: [{ media_id: '40000000-0000-4000-8000-000000000009', caption: 'A quiz' }],
      },
    });
    expect(upload).toHaveBeenCalledWith(expect.any(File), 'image');
  }, 20_000); // many keystrokes: slow when the whole suite runs at once

  it('uploads installers as download buttons, guessing the label, and waits for them before saving', async () => {
    const calls = mockApi();
    let finish: () => void = () => {};
    const uploadApp = vi.fn(
      (file: File, o: { onProgress?: (p: { sent: number; total: number }) => void; signal?: AbortSignal }) =>
        new Promise<never>((done, fail) => {
          o.onProgress?.({ sent: 10 * 1024 * 1024, total: 25 * 1024 * 1024 });
          o.signal?.addEventListener('abort', () => fail(new Error('cancelled')));
          if (file.name.endsWith('.exe'))
            finish = () =>
              done({
                id: '41000000-0000-4000-8000-000000000001',
                kind: 'app',
                mime: 'application/vnd.microsoft.portable-executable',
                bytes: 25 * 1024 * 1024,
                width: null,
                height: null,
                widths: [],
                alt: '',
                original_name: 'Quiz-Setup.exe',
              } as never);
        }),
    );
    render(<ProjectsAdmin uploadApp={uploadApp} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit Quiz' }));
    const form = screen.getByRole('form', { name: 'Edit Quiz' });
    await user.click(part(form, 'Download'));
    await user.upload(within(form).getByLabelText('Upload installers'), [
      new File(['MZ'], 'Quiz-Setup.exe'),
      new File(['x'], 'Quiz-mac-arm64.dmg'),
    ]);

    const rows = within(within(form).getByRole('list', { name: 'Downloads' })).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByRole('textbox', { name: /^Label/ })).toHaveValue('Windows');
    expect(within(rows[0]!).getByRole('textbox', { name: /^Note/ })).toHaveValue('Installer');
    expect(within(rows[1]!).getByRole('combobox', { name: 'For' })).toHaveValue('mac-arm');
    expect(rows[0]).toHaveTextContent('10.0 MB of 25.0 MB');

    await user.click(within(form).getByRole('button', { name: 'Save & update' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Wait for the uploads to finish (or cancel them).');
    await user.click(within(rows[1]!).getByRole('button', { name: 'Cancel download 2' }));
    finish();
    expect(await within(form).findByText(/“Quiz-Setup.exe” uploaded/)).toBeInTheDocument();
    expect(within(form).getByText('Quiz-Setup.exe')).toBeInTheDocument();

    await user.click(within(form).getByRole('button', { name: 'Save & update' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body).toMatchObject({
      downloads: [
        { label: 'Windows', note: 'Installer', platform: 'windows', media: '41000000-0000-4000-8000-000000000001' },
      ],
    });
  }, 20_000);

  it('the redesigned page (2026-10-20): numbers, a showcase row, install steps per computer; hide and move sections', async () => {
    const calls = mockApi();
    const upload = vi.fn(async () => ({
      id: '42000000-0000-4000-8000-000000000001',
      kind: 'image' as const,
      mime: 'image/png',
      bytes: 3,
      width: 1440,
      height: 900,
      widths: [480, 1440],
      alt: '',
      original_name: 'video.png',
    }));
    render(<ProjectsAdmin upload={upload} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit Quiz' }));
    const form = screen.getByRole('form', { name: 'Edit Quiz' });
    expect(sections(form)).toEqual([
      'Numbers',
      'Why',
      'Showcase',
      'Features',
      'Screenshots',
      'Requirements',
      'Download',
      'Install',
      'Questions',
    ]);

    await user.click(part(form, 'Numbers'));
    await user.click(within(form).getByRole('button', { name: 'Add a number' }));
    await user.type(within(form).getByRole('textbox', { name: 'Value' }), '4 GB');
    await user.type(within(form).getByRole('textbox', { name: 'Line' }), 'of RAM is enough');
    expect(part(form, 'Numbers')).toHaveTextContent(/^Numbers\W*on$/);
    // Questions first, Numbers hidden.
    await user.click(within(form).getByRole('checkbox', { name: 'Show on the page' }));
    expect(part(form, 'Numbers')).toHaveTextContent(/off$/);
    expect(part(form, 'Features')).toHaveTextContent(/empty$/);
    await user.click(part(form, 'Questions'));
    for (let i = 0; i < 8; i++) await user.click(within(form).getByRole('button', { name: 'Move up Questions' }));
    expect(sections(form)[0]).toBe('Questions');
    expect(within(form).getByRole('button', { name: 'Move up Questions' })).toBeDisabled();

    await user.click(part(form, 'Showcase'));
    await user.click(within(form).getByRole('button', { name: 'Add a row: upload its image' }));
    await user.upload(
      within(form).getByLabelText('Upload a showcase image'),
      new File(['png'], 'video.png', { type: 'image/png' }),
    );
    expect(await within(form).findByText('Row added with “video.png”: give it a title.')).toBeInTheDocument();
    const rows = within(form).getByRole('list', { name: 'Showcase rows' });
    await user.type(within(rows).getByRole('textbox', { name: 'Title' }), 'Trim and join');
    await user.type(within(rows).getByRole('textbox', { name: /^Points/ }), 'V4: Captions{Enter}Snapshots');
    await user.selectOptions(within(rows).getByRole('combobox', { name: 'Colour' }), 'lime');

    await user.click(part(form, 'Install'));
    await user.click(within(form).getByRole('button', { name: 'Add a step' }));
    const steps = within(form).getByRole('list', { name: 'Steps' });
    await user.type(within(steps).getByRole('textbox', { name: 'Title' }), 'Open the installer');
    await user.selectOptions(within(steps).getByRole('combobox', { name: 'For' }), 'windows');

    await user.click(part(form, 'Download'));
    await user.type(within(form).getByLabelText('Release date (optional)'), '2026-10-19');

    await user.click(within(form).getByRole('button', { name: 'Save & update' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body).toMatchObject({
      highlights: [{ value: '4 GB', label: 'of RAM is enough' }],
      hidden_sections: ['numbers'],
      section_order: [
        'faq',
        'numbers',
        'why',
        'showcase',
        'features',
        'screenshots',
        'requirements',
        'download',
        'install',
      ],
      showcase: [
        {
          media_id: '42000000-0000-4000-8000-000000000001',
          title: 'Trim and join',
          points: [
            { code: 'V4', text: 'Captions' },
            { code: '', text: 'Snapshots' },
          ],
          color: 'lime',
        },
      ],
      steps: [{ title: 'Open the installer', text: '', platform: 'windows' }],
      release_date: '2026-10-19',
    });
  }, 30_000);

  it('asks for a title on a reason that has text', async () => {
    const calls = mockApi();
    render(<ProjectsAdmin />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit Quiz' }));
    const form = screen.getByRole('form', { name: 'Edit Quiz' });
    await user.click(part(form, 'Features'));
    await user.click(within(form).getByRole('button', { name: 'Add a feature' }));
    await user.type(within(form).getByRole('textbox', { name: 'Text' }), 'Works offline.');
    await user.click(part(form, 'Card'));
    await user.click(within(form).getByRole('button', { name: 'Save & update' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Every feature needs a title');
    // The editor opens the part to fix.
    expect(part(form, 'Features')).toHaveAttribute('aria-current', 'true');
    expect(within(form).getByRole('textbox', { name: 'Text' })).toHaveValue('Works offline.');
    expect(calls).toEqual([]);
  });

  it('reorders the sections by dragging them in the list (2026-10-20)', async () => {
    const calls = mockApi();
    render(<ProjectsAdmin />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit Quiz' }));
    const form = screen.getByRole('form', { name: 'Edit Quiz' });
    const item = (name: string) => part(form, name).closest('li')!;
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(item('Download'), { dataTransfer });
    fireEvent.dragOver(item('Why'), { dataTransfer });
    fireEvent.drop(item('Download'), { dataTransfer });
    fireEvent.dragEnd(item('Download'), { dataTransfer });
    expect(sections(form).slice(0, 3)).toEqual(['Numbers', 'Download', 'Why']);
    await user.click(within(form).getByRole('button', { name: 'Save & update' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect((calls[0]!.body as { section_order: string[] }).section_order.slice(0, 3)).toEqual([
      'numbers',
      'download',
      'why',
    ]);
  });

  it('shows an error when the list cannot load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    );
    render(<ProjectsAdmin />);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
  });
});
