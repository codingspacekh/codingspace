import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api } from '@/lib/admin-api';
import type { AuthorSection, HeaderPart } from '@/lib/author';
import { IMAGE_ACCEPT, type MediaKind } from '@/lib/media-rules';
import { uploadMedia, type UploadedMedia } from '@/lib/media-upload';
import { thumbnailUrl } from '@/lib/media-urls';
import { EMAIL } from '@/lib/site-rules';
import {
  sectionsBody,
  SectionsEditor,
  sectionsProblem,
  sectionState,
  type SectionState,
} from './author-sections-admin';
import { MediaPicker } from './media-library';

type Profile = {
  name: string;
  bio: string;
  years: number | null;
  students: number | null;
  email: string;
  hidden: HeaderPart[];
};
type Photo = { id: string; widths: number[] };
type Loaded = { profile: Profile; photo: Photo | null; sections: AuthorSection[] };
type Upload = (file: File, kind: MediaKind) => Promise<UploadedMedia>;

const count = (v: string): number | null => (v.trim() === '' ? null : Number(v));

/** What stops saving, if anything: the server checks the same (03 ADM-14). */
function problemOf(p: Profile, years: string, students: string, sections: SectionState[]): string | null {
  if (!p.name.trim()) return 'Add your name.';
  if (p.email.trim() && !EMAIL.test(p.email.trim())) return 'The email address doesn’t look right.';
  for (const [label, v, max] of [
    ['Years teaching', years, 100],
    ['Students taught', students, 1_000_000],
  ] as const) {
    const n = count(v);
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > max))
      return `${label} must be a whole number from 0 to ${max}.`;
  }
  return sectionsProblem(sections);
}

/**
 * 03 ADM-14: the Author page. The header (photo, name, bio, facts) and the sections below it, in
 * the order shown; every part but the name can be hidden. One Save writes it all and rebuilds
 * the page.
 */
export function AuthorAdmin({ upload = uploadMedia, previewDelay = 400 }: { upload?: Upload; previewDelay?: number }) {
  const id = useId();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loaded, setLoaded] = useState<'loading' | 'failed' | 'ok'>('loading');
  const [profile, setProfile] = useState<Profile>({
    name: '',
    bio: '',
    years: null,
    students: null,
    email: '',
    hidden: [],
  });
  const [years, setYears] = useState('');
  const [students, setStudents] = useState('');
  const [sections, setSections] = useState<SectionState[]>([]);
  const [preview, setPreview] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    void api<Loaded>('/api/admin/author').then(({ status, data }) => {
      if (status !== 200) return setLoaded('failed');
      setProfile({ ...data.profile, hidden: data.profile.hidden ?? [] });
      setPhoto(data.photo ?? null);
      setYears(data.profile.years == null ? '' : String(data.profile.years));
      setStudents(data.profile.students == null ? '' : String(data.profile.students));
      setSections(data.sections.map(sectionState));
      setLoaded('ok');
    });
  }, []);

  // Live preview of the bio: rendered by the server exactly as visitors will see it.
  const latest = useRef(0);
  useEffect(() => {
    if (loaded !== 'ok') return;
    const ticket = ++latest.current;
    const timer = setTimeout(async () => {
      const { status, data } = await api<{ html?: string }>('/api/admin/author/preview', {
        method: 'POST',
        body: { bio: profile.bio },
      });
      if (status === 200 && ticket === latest.current) setPreview(data.html ?? '');
    }, previewDelay);
    return () => clearTimeout(timer);
  }, [profile.bio, loaded, previewDelay]);

  const problem = problemOf(profile, years, students, sections);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setProfile((p) => ({ ...p, [k]: v }));
  const shown = (part: HeaderPart) => !profile.hidden.includes(part);
  const show = (part: HeaderPart, on: boolean) =>
    set('hidden', on ? profile.hidden.filter((h) => h !== part) : [...profile.hidden, part]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (problem) return;
    setBusy(true);
    const { status, data } = await api<{ error?: string; failed?: string[] }>('/api/admin/author', {
      method: 'PUT',
      body: {
        profile: { ...profile, years: count(years), students: count(students), photo_media_id: photo?.id ?? null },
        sections: sectionsBody(sections),
      },
    }).catch(() => ({ status: 0, data: {} as { error?: string; failed?: string[] } }));
    setBusy(false);
    setMessage(
      status === 200
        ? data.failed?.length
          ? 'Saved. The Author page will catch up within 5 minutes.'
          : 'Saved. The Author page is updated.'
        : `Not saved: ${data.error ?? 'try again'}.`,
    );
  }

  if (loaded === 'loading') return <p aria-live="polite">Loading…</p>;
  if (loaded === 'failed')
    return (
      <p role="alert" className="adm-error">
        The profile could not be loaded. Reload the page to try again.
      </p>
    );

  return (
    <form className="adm-form adm-author" onSubmit={save} aria-label="Author page" noValidate>
      <h1>Author page</h1>
      <PhotoField photo={photo} name={profile.name} upload={upload} onChange={setPhoto}>
        <ShowBox part="photo" label="Show the photo (otherwise your initials)" shown={shown} onShow={show} />
      </PhotoField>
      <label>
        Name
        <input value={profile.name} maxLength={80} required onChange={(e) => set('name', e.target.value)} />
      </label>
      <div className="adm-bio">
        <div className="adm-bio-edit">
          <label>
            About you
            <textarea rows={8} maxLength={5000} value={profile.bio} onChange={(e) => set('bio', e.target.value)} />
          </label>
          <p className="adm-hint">
            Markdown: **bold**, *italic*, [a link](https://…), and a blank line between paragraphs.
          </p>
          <ShowBox part="bio" label="Show the bio" shown={shown} onShow={show} />
        </div>
        <div className="frame adm-section adm-bio-preview">
          <h2 className="meta">Preview</h2>
          <div
            role="region"
            aria-label="Bio preview"
            aria-live="polite"
            className="prose"
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        </div>
      </div>
      <div className="adm-row">
        <div className="adm-fact">
          <label>
            Years teaching
            <input inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value)} />
          </label>
          <ShowBox part="years" label="Show years teaching" shown={shown} onShow={show} />
        </div>
        <div className="adm-fact">
          <label>
            Students taught
            <input inputMode="numeric" value={students} onChange={(e) => setStudents(e.target.value)} />
          </label>
          <ShowBox part="students" label="Show students taught" shown={shown} onShow={show} />
        </div>
      </div>
      <div className="adm-fact">
        <label>
          Public email
          <input type="email" value={profile.email} maxLength={200} onChange={(e) => set('email', e.target.value)} />
        </label>
        <ShowBox part="email" label="Show the email" shown={shown} onShow={show} />
      </div>

      <SectionsEditor sections={sections} onChange={setSections} />

      {touched && problem && (
        <p role="alert" className="adm-error" id={`${id}-problem`}>
          {problem}
        </p>
      )}
      <div className="adm-quick">
        <button type="submit" className="btn pri" disabled={busy}>
          Save
        </button>
        <a className="btn" href="/author" target="_blank" rel="noopener">
          View the Author page
        </a>
      </div>
      <p className="adm-live" role="status">
        {message}
      </p>
    </form>
  );
}

/** "Show …" for a part of the header the owner can hide. */
function ShowBox({
  part,
  label,
  shown,
  onShow,
}: {
  part: HeaderPart;
  label: string;
  shown: (part: HeaderPart) => boolean;
  onShow: (part: HeaderPart, on: boolean) => void;
}) {
  return (
    <label className="adm-inline">
      <input type="checkbox" checked={shown(part)} onChange={(e) => onShow(part, e.target.checked)} />
      {label}
    </label>
  );
}

/**
 * The author's photo (owner request): shown on the Author page instead of the initials.
 * Uploaded like any image (EXIF and GPS removed), or chosen from the media library.
 * Part of the form: it is saved with Save.
 */
function PhotoField({
  photo,
  name,
  upload,
  onChange,
  children,
}: {
  photo: Photo | null;
  name: string;
  upload: Upload;
  onChange: (p: Photo | null) => void;
  children?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');
  const [picking, setPicking] = useState(false);
  const preview = photo ? thumbnailUrl(photo.id, photo.widths) : null;
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  async function chosen(file: File | undefined) {
    if (!file) return;
    setNote(`Uploading “${file.name}”…`);
    try {
      const m = await upload(file, 'image');
      onChange({ id: m.id, widths: m.widths });
      setNote('Photo ready. Save to show it on the Author page.');
    } catch (e) {
      setNote(`Couldn’t upload “${file.name}”: ${e instanceof Error ? e.message : 'try again'}`);
    }
  }

  return (
    <fieldset className="adm-photo">
      <legend>Photo</legend>
      <div className={`avatar${preview ? ' avatar--photo' : ''}`}>
        {preview ? (
          <img src={preview} alt={`${name || 'You'}, as shown on the Author page`} />
        ) : (
          <span aria-hidden="true">{initials}</span>
        )}
      </div>
      <div className="adm-photo-actions">
        <p className="adm-hint">
          {preview
            ? 'Shown in the hexagon on the Author page. A square photo of your face works best.'
            : 'No photo yet: the page shows your initials. A square photo of your face works best.'}
        </p>
        <div className="adm-quick">
          <button type="button" className="btn" onClick={() => input.current?.click()}>
            {preview ? 'Upload a new photo' : 'Upload a photo'}
          </button>
          <button type="button" className="btn" onClick={() => setPicking(true)}>
            Choose from the media library
          </button>
          {preview && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                onChange(null);
                setNote('Photo removed. Save to show your initials again.');
              }}
            >
              Remove photo
            </button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept={IMAGE_ACCEPT}
          hidden
          aria-label="Upload a photo"
          onChange={(e) => {
            void chosen(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {children}
        <p className="adm-live" role="status">
          {note}
        </p>
      </div>
      {picking && (
        <MediaPicker
          onClose={() => setPicking(false)}
          onPick={(m) => {
            setPicking(false);
            if (m.kind !== 'image') return setNote('Choose an image, not a file.');
            onChange({ id: m.id, widths: m.widths });
            setNote(`“${m.original_name}” chosen. Save to show it on the Author page.`);
          }}
        />
      )}
    </fieldset>
  );
}
