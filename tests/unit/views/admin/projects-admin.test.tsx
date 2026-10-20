import { screen, waitFor, within } from '@testing-library/react';
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
  ...extra,
});
const projects = () => [
  project('quiz', 'Quiz', { is_featured: true, subject_id: 'coding', tag: 'Web app', platforms: ['Web'] }),
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

/** A closed part of the page fields, by its title. */
const part = (form: HTMLElement, title: string) =>
  [...form.querySelectorAll('summary')].find((s) => s.firstChild?.textContent?.trim() === title)!;

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
    const form = await screen.findByRole('form', { name: 'Add a project' });
    const user = userEvent.setup();
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
        },
      }),
    );
    expect(await screen.findByText('Added “Graph lab” at the end.')).toBeInTheDocument();
    expect(within(form).getByRole('textbox', { name: 'Name' })).toHaveValue('');
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

  it('edits a project in place', async () => {
    const calls = mockApi();
    render(<ProjectsAdmin />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit Quiz' }));
    const form = screen.getByRole('form', { name: 'Edit Quiz' });
    expect(within(form).getByRole('textbox', { name: /Platforms/ })).toHaveValue('Web');
    await user.clear(within(form).getByRole('textbox', { name: 'Name' }));
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'Quiz 2');
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(calls[0]).toMatchObject({ method: 'PUT', url: '/api/admin/projects/quiz', body: { name: 'Quiz 2' } }),
    );
    expect(screen.queryByRole('form', { name: 'Edit Quiz' })).toBeNull();
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

    await user.click(part(form, 'Why use it'));
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
    await user.click(within(form).getByRole('button', { name: 'Save' }));
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

    await user.click(within(form).getByRole('button', { name: 'Save' }));
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

    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Wait for the uploads to finish (or cancel them).');
    await user.click(within(rows[1]!).getByRole('button', { name: 'Cancel download 2' }));
    finish();
    expect(await within(form).findByText(/“Quiz-Setup.exe” uploaded/)).toBeInTheDocument();
    expect(within(form).getByText('Quiz-Setup.exe')).toBeInTheDocument();

    await user.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body).toMatchObject({
      downloads: [
        { label: 'Windows', note: 'Installer', platform: 'windows', media: '41000000-0000-4000-8000-000000000001' },
      ],
    });
  }, 20_000);

  it('asks for a title on a reason that has text', async () => {
    const calls = mockApi();
    render(<ProjectsAdmin />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit Quiz' }));
    const form = screen.getByRole('form', { name: 'Edit Quiz' });
    await user.click(part(form, 'Features'));
    await user.click(within(form).getByRole('button', { name: 'Add a feature' }));
    await user.type(within(form).getByRole('textbox', { name: 'Text' }), 'Works offline.');
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Every feature needs a title');
    expect(calls).toEqual([]);
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
