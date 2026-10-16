import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthorAdmin } from '@/views/admin/author-admin';
import type { UploadedMedia } from '@/lib/media-upload';

const loaded = {
  profile: { name: 'CodingSpace', bio: 'I teach.', years: 8, students: null, email: 'hello@codingspace.io' },
  timeline: [
    { year: 2018, text: 'Started teaching.' },
    { year: 2026, text: 'Launched the site.' },
  ],
};

type Call = { method: string; body: unknown };
function mockApi(reply: [number, unknown] = [200, { ok: true }]) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') return new Response(JSON.stringify(loaded), { status: 200 });
      calls.push({ method: init.method, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify(reply[1]), { status: reply[0] });
    }),
  );
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe('author page admin (03 ADM-14)', () => {
  it('loads the profile and timeline, and saves them together', async () => {
    const calls = mockApi();
    render(<AuthorAdmin />);
    const user = userEvent.setup();
    const bio = await screen.findByRole('textbox', { name: 'About you' });
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('CodingSpace');
    expect(screen.getByRole('textbox', { name: 'Students taught' })).toHaveValue('');
    await user.clear(bio);
    await user.type(bio, 'Maths and code.');
    await user.type(screen.getByRole('textbox', { name: 'Students taught' }), '500');

    // Reorder and extend the timeline.
    await user.click(screen.getByRole('button', { name: 'Move entry 2 up' }));
    await user.click(screen.getByRole('button', { name: 'Add an entry' }));
    await user.clear(screen.getByRole('textbox', { name: 'Year of entry 3' }));
    await user.type(screen.getByRole('textbox', { name: 'Year of entry 3' }), '2027');
    await user.type(screen.getByRole('textbox', { name: 'What happened, entry 3' }), 'Next step.');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(calls[0]).toEqual({
        method: 'PUT',
        body: {
          profile: {
            name: 'CodingSpace',
            bio: 'Maths and code.',
            years: 8,
            students: 500,
            email: 'hello@codingspace.io',
            photo_media_id: null,
          },
          timeline: [
            { year: 2026, text: 'Launched the site.' },
            { year: 2018, text: 'Started teaching.' },
            { year: 2027, text: 'Next step.' },
          ],
        },
      }),
    );
    expect(await screen.findByText('Saved. The Author page is updated.')).toBeInTheDocument();
  });

  it.each([
    ['an empty name', 'Name', '', 'Add your name.'],
    ['a bad email', 'Public email (shown on the page; leave empty to hide)', 'nope', 'doesn’t look right'],
    ['a negative stat', 'Years teaching', '-1', 'whole number'],
  ])('does not save %s, and says why', async (_, field, value, reason) => {
    const calls = mockApi();
    render(<AuthorAdmin />);
    const user = userEvent.setup();
    const input = await screen.findByRole('textbox', { name: field });
    await user.clear(input);
    if (value) await user.type(input, value);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent(reason);
    expect(calls).toEqual([]);
  });

  it('an empty timeline entry must be filled in or removed', async () => {
    const calls = mockApi();
    render(<AuthorAdmin />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add an entry' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Timeline entry 3: write what happened');
    await user.click(screen.getByRole('button', { name: 'Remove entry 3' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls).toHaveLength(1));
  });

  it('says why the server refused', async () => {
    mockApi([422, { error: 'profile.email: not an email address' }]);
    render(<AuthorAdmin />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/^Not saved: profile\.email/)).toBeInTheDocument();
  });

  it('shows an error when the profile cannot load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    );
    render(<AuthorAdmin />);
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
      render(<AuthorAdmin upload={upload} />);
      const user = userEvent.setup();
      const field = await screen.findByRole('group', { name: 'Photo' });
      expect(field.querySelector('.avatar')).toHaveTextContent('C'); // the initials
      await user.upload(screen.getByLabelText('Upload a photo'), new File(['x'], 'me.jpg', { type: 'image/jpeg' }));
      expect(upload).toHaveBeenCalledWith(expect.objectContaining({ name: 'me.jpg' }), 'image');
      expect(await screen.findByRole('img', { name: 'CodingSpace, as shown on the Author page' })).toHaveAttribute(
        'src',
        `https://files.codingspace.io/i/${PHOTO}/480.webp`,
      );
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect((calls[0]!.body as { profile: { photo_media_id: string } }).profile.photo_media_id).toBe(PHOTO),
      );
    });

    it('a photo can be removed (back to the initials)', async () => {
      const calls = mockApi();
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init?: RequestInit) => {
          if (!init?.method || init.method === 'GET')
            return new Response(JSON.stringify({ ...loaded, photo: { id: PHOTO, widths: [480] } }), { status: 200 });
          calls.push({ method: init.method, body: JSON.parse(String(init.body)) });
          return new Response('{}', { status: 200 });
        }),
      );
      render(<AuthorAdmin />);
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
