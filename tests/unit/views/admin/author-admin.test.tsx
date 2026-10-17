import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthorAdmin } from '@/views/admin/author-admin';
import type { UploadedMedia } from '@/lib/media-upload';

const item = (title: string, extra: Record<string, unknown> = {}) => ({
  title,
  subtitle: '',
  period: '',
  note: '',
  url: null,
  tags: [],
  visible: true,
  ...extra,
});
const loaded = {
  profile: {
    name: 'CodingSpace',
    bio: 'I teach.',
    years: 8,
    students: null,
    email: 'hello@codingspacekh.dev',
    photo_media_id: null,
    hidden: [],
  },
  photo: null,
  sections: [
    {
      kind: 'timeline',
      title: 'Timeline',
      visible: true,
      items: [item('Started teaching.', { period: '2018' }), item('Launched the site.', { period: '2026' })],
    },
    { kind: 'experience', title: 'Experience', visible: true, items: [] },
    { kind: 'education', title: 'Education', visible: true, items: [] },
    { kind: 'skills', title: 'Skills', visible: true, items: [item('Code', { tags: ['Python', 'C++'] })] },
    { kind: 'awards', title: 'Awards & certificates', visible: true, items: [] },
    { kind: 'hobbies', title: 'Hobbies & interests', visible: true, items: [] },
    { kind: 'life_posts', title: 'Life posts', visible: true, items: [] },
  ],
};

type Call = { method: string; body: unknown };
type Body = {
  profile: Record<string, unknown>;
  sections: { kind: string; title: string; visible: boolean; items: unknown[] }[];
};
function mockApi(reply: [number, unknown] = [200, { ok: true }], data: unknown = loaded) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') return new Response(JSON.stringify(data), { status: 200 });
      const body = JSON.parse(String(init.body)) as { bio?: string };
      if (url.endsWith('/preview'))
        return new Response(JSON.stringify({ html: `<p>${body.bio}</p>` }), { status: 200 });
      calls.push({ method: init.method, body });
      return new Response(JSON.stringify(reply[1]), { status: reply[0] });
    }),
  );
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

const section = (name: string) => screen.getByRole('group', { name });
const saved = (calls: Call[]) => calls[0]!.body as Body;

describe('author page admin (03 ADM-14)', () => {
  it('loads the page and saves the header, what to hide, and every section in order', async () => {
    const calls = mockApi();
    render(<AuthorAdmin previewDelay={0} />);
    const user = userEvent.setup();
    const bio = await screen.findByRole('textbox', { name: 'About you' });
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('CodingSpace');
    expect(screen.getByRole('textbox', { name: 'Students taught' })).toHaveValue('');
    await user.clear(bio);
    await user.type(bio, 'Maths and code.');
    await user.type(screen.getByRole('textbox', { name: 'Students taught' }), '500');
    await user.click(screen.getByRole('checkbox', { name: 'Show the email' }));

    // Timeline: reorder; Education: one qualification, hidden; Hobbies: hidden, moved to the top.
    await user.click(within(section('Timeline')).getByRole('button', { name: 'Move item 2 up' }));
    const education = section('Education');
    await user.click(within(education).getByRole('button', { name: 'Add a qualification' }));
    await user.type(within(education).getByRole('textbox', { name: 'Qualification' }), 'BSc Physics');
    await user.type(within(education).getByRole('textbox', { name: 'School or university' }), 'RUPP');
    await user.type(within(education).getByRole('textbox', { name: 'Years (e.g. 2012 – 2016)' }), '2012 – 2016');
    await user.click(within(education).getByRole('checkbox', { name: 'Show item 1' }));
    const hobbies = section('Hobbies & interests');
    await user.click(within(hobbies).getByRole('checkbox', { name: 'Show this section' }));
    for (let i = 0; i < 5; i++) await user.click(within(hobbies).getByRole('button', { name: 'Move section up' }));
    expect(within(hobbies).getByRole('button', { name: 'Move section up' })).toBeDisabled();
    await user.clear(within(section('Skills')).getByRole('textbox', { name: 'Heading' }));
    await user.type(within(section('Skills')).getByRole('textbox', { name: 'Heading' }), 'What I know');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    const body = saved(calls);
    expect(body.profile).toEqual({
      name: 'CodingSpace',
      bio: 'Maths and code.',
      years: 8,
      students: 500,
      email: 'hello@codingspacekh.dev',
      photo_media_id: null,
      hidden: ['email'],
    });
    expect(body.sections.map((s) => [s.kind, s.title, s.visible])).toEqual([
      ['hobbies', 'Hobbies & interests', false],
      ['timeline', 'Timeline', true],
      ['experience', 'Experience', true],
      ['education', 'Education', true],
      ['skills', 'What I know', true],
      ['awards', 'Awards & certificates', true],
      ['life_posts', 'Life posts', true],
    ]);
    expect(body.sections[1]!.items).toEqual([
      item('Launched the site.', { period: '2026' }),
      item('Started teaching.', { period: '2018' }),
    ]);
    expect(body.sections[3]!.items).toEqual([
      item('BSc Physics', { subtitle: 'RUPP', period: '2012 – 2016', visible: false }),
    ]);
    expect(body.sections[4]!.items).toEqual([item('Code', { tags: ['Python', 'C++'] })]);
    expect(await screen.findByText('Saved. The Author page is updated.')).toBeInTheDocument();
  });

  it('shows a live preview of the bio, as visitors will see it', async () => {
    mockApi();
    render(<AuthorAdmin previewDelay={0} />);
    const preview = await screen.findByRole('region', { name: 'Bio preview' });
    await waitFor(() => expect(preview.innerHTML).toContain('<p>I teach.</p>'));
  });

  it('skills are typed with commas between them', async () => {
    const calls = mockApi();
    render(<AuthorAdmin previewDelay={0} />);
    const user = userEvent.setup();
    const skills = await screen.findByRole('group', { name: 'Skills' });
    const tags = within(skills).getByRole('textbox', { name: 'Skills, separated by commas' });
    expect(tags).toHaveValue('Python, C++');
    await user.type(tags, ', Pascal,,');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(saved(calls).sections[3]!.items).toEqual([item('Code', { tags: ['Python', 'C++', 'Pascal'] })]);
  });

  it('adds, fills in and removes custom sections', async () => {
    const calls = mockApi();
    render(<AuthorAdmin previewDelay={0} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add a custom section' }));
    let custom = section('Custom section 1');
    await user.type(within(custom).getByRole('textbox', { name: 'Heading' }), 'Languages');
    custom = section('Custom section 1');
    await user.click(within(custom).getByRole('button', { name: 'Add an item' }));
    await user.type(within(custom).getByRole('textbox', { name: 'Item' }), 'Khmer');
    await user.click(screen.getByRole('button', { name: 'Add a custom section' }));
    await user.click(within(section('Custom section 2')).getByRole('button', { name: 'Remove section' }));
    expect(screen.queryByRole('group', { name: 'Custom section 2' })).toBeNull();
    // Built-in sections can be hidden, not removed.
    expect(within(section('Skills')).queryByRole('button', { name: 'Remove section' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(saved(calls).sections.at(-1)).toEqual({
      kind: 'custom',
      title: 'Languages',
      visible: true,
      items: [item('Khmer')],
    });
  });

  it.each([
    ['an empty name', 'Name', '', 'Add your name.'],
    ['a bad email', 'Public email', 'nope', 'doesn’t look right'],
    ['a negative stat', 'Years teaching', '-1', 'whole number'],
  ])('does not save %s, and says why', async (_, field, value, reason) => {
    const calls = mockApi();
    render(<AuthorAdmin previewDelay={0} />);
    const user = userEvent.setup();
    const input = await screen.findByRole('textbox', { name: field });
    await user.clear(input);
    if (value) await user.type(input, value);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent(reason);
    expect(calls).toEqual([]);
  });

  it('an empty item must be filled in or removed; links must be https', async () => {
    const calls = mockApi();
    render(<AuthorAdmin previewDelay={0} />);
    const user = userEvent.setup();
    const timeline = await screen.findByRole('group', { name: 'Timeline' });
    await user.click(within(timeline).getByRole('button', { name: 'Add an entry' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Timeline, item 3: fill in “What happened”, or remove the item.',
    );
    await user.click(within(timeline).getByRole('button', { name: 'Remove item 3' }));

    const awards = section('Awards & certificates');
    await user.click(within(awards).getByRole('button', { name: 'Add an award' }));
    await user.type(within(awards).getByRole('textbox', { name: 'Award or certificate' }), 'Prize');
    await user.type(within(awards).getByRole('textbox', { name: 'Link (optional)' }), 'http://x.example');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Awards & certificates, item 1: The address must start with https://',
    );
    await user.clear(within(awards).getByRole('textbox', { name: 'Link (optional)' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls).toHaveLength(1));
  });

  it('says why the server refused', async () => {
    mockApi([422, { error: 'profile.email: not an email address' }]);
    render(<AuthorAdmin previewDelay={0} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/^Not saved: profile\.email/)).toBeInTheDocument();
  });

  it('shows an error when the profile cannot load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    );
    render(<AuthorAdmin previewDelay={0} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
  });

  describe('photo (shown instead of the initials)', () => {
    const PHOTO = '3f2b8c1e-9a4d-4c6b-8e2f-1a2b3c4d5e6f';
    const uploaded: UploadedMedia = {
      id: PHOTO,
      kind: 'image',
      mime: 'image/jpeg',
      bytes: 1000,
      width: 800,
      height: 800,
      widths: [480, 800],
      alt: '',
      original_name: 'me.jpg',
    };

    it('shows the initials until a photo is uploaded; the photo is saved with the profile', async () => {
      const calls = mockApi();
      const upload = vi.fn(async () => uploaded);
      render(<AuthorAdmin upload={upload} previewDelay={0} />);
      const user = userEvent.setup();
      const field = await screen.findByRole('group', { name: 'Photo' });
      expect(field.querySelector('.avatar')).toHaveTextContent('C'); // the initials
      await user.upload(screen.getByLabelText('Upload a photo'), new File(['x'], 'me.jpg', { type: 'image/jpeg' }));
      expect(upload).toHaveBeenCalledWith(expect.objectContaining({ name: 'me.jpg' }), 'image');
      expect(await screen.findByRole('img', { name: 'CodingSpace, as shown on the Author page' })).toHaveAttribute(
        'src',
        `https://files.codingspacekh.dev/i/${PHOTO}/480.webp`,
      );
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect((calls[0]!.body as { profile: { photo_media_id: string } }).profile.photo_media_id).toBe(PHOTO),
      );
    });

    it('a photo can be removed (back to the initials)', async () => {
      const calls = mockApi(undefined, { ...loaded, photo: { id: PHOTO, widths: [480] } });
      render(<AuthorAdmin previewDelay={0} />);
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: 'Remove photo' }));
      expect(screen.queryByRole('img')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect((calls[0]!.body as { profile: { photo_media_id: string | null } }).profile.photo_media_id).toBeNull(),
      );
    });

    it('says why an upload failed', async () => {
      mockApi();
      render(
        <AuthorAdmin
          previewDelay={0}
          upload={async () => {
            throw new Error('HEIC photos can’t be shown in every browser.');
          }}
        />,
      );
      // applyAccept off: the picker would hide .heic; the upload rules must refuse it themselves.
      await userEvent
        .setup({ applyAccept: false })
        .upload(await screen.findByLabelText('Upload a photo'), new File(['x'], 'me.heic', { type: 'image/heic' }));
      expect(await screen.findByText(/Couldn’t upload “me.heic”: HEIC/)).toBeInTheDocument();
    });
  });
});
