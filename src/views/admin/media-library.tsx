import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { api } from '@/lib/admin-api';
import { FILE_ACCEPT, formatBytes, IMAGE_ACCEPT, type MediaKind } from '@/lib/media-rules';
import { uploadMedia, type UploadedMedia } from '@/lib/media-upload';
import { fileKey, mediaUrl, thumbnailUrl } from '@/lib/media-urls';
import type { MediaUse } from '@/server/media/library';
import type { MediaItem } from '@/server/media/uploads';

/**
 * 03 ADM-10: every uploaded image and file — browse, search, see where each is used, rename,
 * set the default alt text, delete what no post uses. The editor reuses the list (MediaPicker).
 */

export type Filters = { kind: '' | MediaKind; q: string; unused: boolean };
type Detail = MediaItem & { used_by: MediaUse[]; author_photo?: boolean };
type Upload = (file: File, kind: MediaKind) => Promise<UploadedMedia>;

function query(f: Filters, before?: string) {
  const p = new URLSearchParams();
  if (f.kind) p.set('kind', f.kind);
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.unused) p.set('unused', '1');
  if (before) p.set('before', before);
  return p.toString();
}

/** The library list for these filters, newest first, a page at a time. */
export function useMediaList(filters: Filters) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (before?: string) => {
      const { status, data } = await api<{ items?: MediaItem[]; more?: boolean }>(
        `/api/admin/media?${query(filters, before)}`,
      );
      setFailed(status !== 200);
      if (status !== 200) return;
      setItems((prev) => (before ? [...(prev ?? []), ...(data.items ?? [])] : (data.items ?? [])));
      setMore(!!data.more);
    },
    [filters],
  );

  useEffect(() => {
    // Loading the list for the current filters is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const loadMore = () => {
    const last = items?.at(-1);
    if (last) void load(last.created_at);
  };
  return { items, setItems, more, failed, reload: () => load(), loadMore };
}

function Thumb({ item }: { item: MediaItem }) {
  const src = item.kind === 'image' ? thumbnailUrl(item.id, item.widths) : null;
  return src ? (
    <img src={src} alt="" width={160} height={Math.round((160 * (item.height ?? 1)) / (item.width ?? 1))} />
  ) : (
    <span className="adm-media-ext" aria-hidden="true">
      {item.original_name.split('.').pop()?.slice(0, 5).toUpperCase() || 'FILE'}
    </span>
  );
}

const summary = (m: MediaItem) =>
  [m.kind === 'image' && m.width ? `${m.width}×${m.height}` : null, formatBytes(m.bytes)].filter(Boolean).join(' · ');

const use = (m: MediaItem) => (m.use_count ? `used in ${m.use_count}` : 'unused');

function FilterBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const [q, setQ] = useState(filters.q);
  return (
    <form
      className="adm-filters"
      role="search"
      aria-label="Find media"
      onSubmit={(e) => {
        e.preventDefault();
        onChange({ ...filters, q });
      }}
    >
      <label>
        Name
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} />
      </label>
      <label>
        Type
        <select
          value={filters.kind}
          onChange={(e) => onChange({ ...filters, q, kind: e.target.value as Filters['kind'] })}
        >
          <option value="">Images and files</option>
          <option value="image">Images</option>
          <option value="file">Files</option>
        </select>
      </label>
      <label className="adm-check">
        <input
          type="checkbox"
          checked={filters.unused}
          onChange={(e) => onChange({ ...filters, q, unused: e.target.checked })}
        />
        Unused only
      </label>
      <button type="submit" className="btn">
        Search
      </button>
    </form>
  );
}

export function MediaLibrary({ upload = uploadMedia }: { upload?: Upload }) {
  const [filters, setFilters] = useState<Filters>({ kind: '', q: '', unused: false });
  const { items, setItems, more, failed, reload, loadMore } = useMediaList(filters);
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(0);
  const images = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);

  async function uploadAll(list: File[], kind: MediaKind) {
    for (const file of list) {
      setUploading((n) => n + 1);
      try {
        const m = await upload(file, kind);
        setMessage(m.duplicate ? `“${file.name}” was already in the library.` : `Uploaded “${m.original_name}”.`);
        if (!m.duplicate) await reload();
      } catch (e) {
        setMessage(`Couldn’t upload “${file.name}”: ${e instanceof Error ? e.message : 'try again'}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  const picked = (kind: MediaKind) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = '';
    void uploadAll(list, kind);
  };

  return (
    <>
      <div className="adm-head">
        <h1>Media</h1>
        <div className="adm-quick">
          <button type="button" className="btn pri" onClick={() => images.current?.click()}>
            Upload images
          </button>
          <button type="button" className="btn" onClick={() => files.current?.click()}>
            Upload files
          </button>
          <input
            ref={images}
            type="file"
            hidden
            multiple
            accept={IMAGE_ACCEPT}
            aria-label="Upload images"
            onChange={picked('image')}
          />
          <input
            ref={files}
            type="file"
            hidden
            multiple
            accept={FILE_ACCEPT}
            aria-label="Upload files"
            onChange={picked('file')}
          />
        </div>
      </div>
      <FilterBar filters={filters} onChange={setFilters} />
      <p className="adm-live" role="status">
        {uploading ? `Uploading ${uploading} file${uploading > 1 ? 's' : ''}…` : message}
      </p>
      {failed ? (
        <p role="alert" className="adm-error">
          The media library could not be loaded. Reload the page to try again.
        </p>
      ) : !items ? (
        <p aria-live="polite">Loading…</p>
      ) : items.length === 0 ? (
        <p className="empty">
          {filters.q || filters.kind || filters.unused ? 'Nothing matches.' : 'Nothing uploaded yet.'}
        </p>
      ) : (
        <ul className="adm-media" aria-label="Media">
          {items.map((m) => (
            <li key={m.id} className={open === m.id ? 'frame is-open' : 'frame'}>
              <button
                type="button"
                className="adm-media-item"
                aria-expanded={open === m.id}
                aria-label={`${m.original_name}, ${summary(m)}, ${use(m)}`}
                onClick={() => setOpen(open === m.id ? null : m.id)}
              >
                <Thumb item={m} />
                <span className="adm-media-name">{m.original_name}</span>
                <span className="meta">
                  {summary(m)} · {use(m)}
                </span>
              </button>
              {open === m.id && (
                <MediaDetails
                  id={m.id}
                  onChanged={(next) => setItems((list) => list?.map((x) => (x.id === next.id ? next : x)) ?? null)}
                  onDeleted={() => {
                    setItems((list) => list?.filter((x) => x.id !== m.id) ?? null);
                    setOpen(null);
                    setMessage(`Deleted “${m.original_name}”.`);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {more && (
        <button type="button" className="btn" onClick={loadMore}>
          Show more
        </button>
      )}
    </>
  );
}

function MediaDetails({
  id,
  onChanged,
  onDeleted,
}: {
  id: string;
  onChanged: (m: MediaItem) => void;
  onDeleted: () => void;
}) {
  const uid = useId();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [name, setName] = useState('');
  const [alt, setAlt] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    void api<Detail & { error?: string }>(`/api/admin/media/${id}`).then(({ status, data }) => {
      if (status !== 200) return setNote(`Couldn’t load the details: ${data.error ?? status}.`);
      setDetail(data);
      setName(data.original_name);
      setAlt(data.alt);
    });
  }, [id]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { status, data } = await api<Detail & { error?: string }>(`/api/admin/media/${id}`, {
      method: 'PATCH',
      body: { original_name: name, alt },
    });
    setBusy(false);
    if (status !== 200) return setNote(`Not saved: ${data.error ?? 'try again'}.`);
    setDetail(data);
    onChanged(data);
    setNote('Saved.');
  }

  async function remove() {
    setBusy(true);
    const { status, data } = await api<{ error?: string }>(`/api/admin/media/${id}`, { method: 'DELETE' });
    setBusy(false);
    if (status === 200) return onDeleted();
    setConfirming(false);
    setNote(`Not deleted: ${data.error ?? 'try again'}.`);
  }

  if (!detail) return <p aria-live="polite">{note || 'Loading…'}</p>;
  const address = detail.kind === 'file' ? mediaUrl(fileKey(detail.id)) : null;

  return (
    <section className="adm-media-detail" aria-label={`Details of ${detail.original_name}`}>
      <form className="adm-form" onSubmit={save}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
        </label>
        {detail.kind === 'image' && (
          <label>
            Default alt text (filled in when the image is inserted)
            <input value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={500} />
          </label>
        )}
        <div className="adm-quick">
          <button type="submit" className="btn pri" disabled={busy || !name.trim()}>
            Save
          </button>
        </div>
      </form>
      <p className="meta">
        {detail.mime} · {summary(detail)} · uploaded {new Date(detail.created_at).toLocaleDateString('en-GB')}
      </p>
      {address && (
        <p className="meta">
          Download address: <code>{address}</code>
        </p>
      )}
      <h3 id={`${uid}-u`}>Used in</h3>
      {detail.used_by.length === 0 && !detail.author_photo ? (
        <p className="meta">Nothing uses it.</p>
      ) : (
        <ul aria-labelledby={`${uid}-u`} className="adm-recent">
          {detail.author_photo && (
            <li>
              <Link href="/admin/author">Author page</Link>
              <span className="meta">your photo</span>
            </li>
          )}
          {detail.used_by.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/posts/${p.id}`}>{p.title || 'Untitled'}</Link>
              <span className="meta">{[p.in_live && 'live', p.in_draft && 'draft'].filter(Boolean).join(' and ')}</span>
            </li>
          ))}
        </ul>
      )}
      {detail.used_by.length > 0 || detail.author_photo ? (
        <p className="adm-hint">
          To delete it, remove it from {detail.used_by.length > 0 ? 'these posts' : 'the Author page'} first
          {detail.used_by.length > 0 ? ' (and publish them, if it is live)' : ''}.
        </p>
      ) : confirming ? (
        <span className="adm-confirm" role="group" aria-label="Confirm delete">
          Delete “{detail.original_name}” for good?
          <button type="button" className="btn adm-danger" disabled={busy} onClick={remove}>
            Delete permanently
          </button>
          <button type="button" className="btn" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </span>
      ) : (
        <div className="adm-quick">
          <button type="button" className="btn adm-danger" onClick={() => setConfirming(true)}>
            Delete…
          </button>
        </div>
      )}
      <p className="adm-live" role="status">
        {note}
      </p>
    </section>
  );
}

/** The editor's "From the media library…": pick an uploaded image or file to insert again. */
export function MediaPicker({ onPick, onClose }: { onPick: (m: MediaItem) => void; onClose: () => void }) {
  const [filters, setFilters] = useState<Filters>({ kind: '', q: '', unused: false });
  const { items, more, failed, loadMore } = useMediaList(filters);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  return (
    <section className="frame ed-picker" aria-labelledby="ed-picker-h">
      <div className="adm-head">
        <h2 id="ed-picker-h" ref={heading} tabIndex={-1}>
          Insert from the media library
        </h2>
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
      <FilterBar filters={filters} onChange={setFilters} />
      {failed ? (
        <p role="alert" className="adm-error">
          The media library could not be loaded.
        </p>
      ) : !items ? (
        <p aria-live="polite">Loading…</p>
      ) : items.length === 0 ? (
        <p className="empty">Nothing matches. Upload with Insert → Image or File.</p>
      ) : (
        <ul className="adm-media" aria-label="Media to insert">
          {items.map((m) => (
            <li key={m.id} className="frame">
              <button
                type="button"
                className="adm-media-item"
                aria-label={`Insert ${m.original_name} (${summary(m)})`}
                onClick={() => onPick(m)}
              >
                <Thumb item={m} />
                <span className="adm-media-name">{m.original_name}</span>
                <span className="meta">{summary(m)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {more && (
        <button type="button" className="btn" onClick={loadMore}>
          Show more
        </button>
      )}
    </section>
  );
}
