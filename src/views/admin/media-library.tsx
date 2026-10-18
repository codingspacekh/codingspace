import Link from 'next/link';
import { Fragment, useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { api } from '@/lib/admin-api';
import { FILE_ACCEPT, formatBytes, IMAGE_ACCEPT, type MediaKind } from '@/lib/media-rules';
import { uploadMedia, type UploadedMedia } from '@/lib/media-upload';
import { fileKey, mediaUrl, thumbnailUrl } from '@/lib/media-urls';
import type { MediaFolder, MediaUse } from '@/server/media/library';
import { FolderBar, FolderHead, files, useFolders, useFolderView } from './media-folders';
import type { MediaItem } from '@/server/media/uploads';

/**
 * 03 ADM-10: every uploaded image and file — browse, search, see where each is used, rename,
 * set the default alt text, delete what no post uses. The editor reuses the list (MediaPicker).
 * v1.1: folders (one level), a grid or list view per folder, moving files between folders.
 */

export type Filters = {
  kind: '' | MediaKind;
  q: string;
  unused: boolean;
  /** v1.1: a folder's id, "none" for Unsorted, '' for every folder. */
  folder?: string;
};
type Detail = MediaItem & { used_by: MediaUse[]; author_photo?: boolean };
type Upload = (file: File, kind: MediaKind) => Promise<UploadedMedia>;

function query(f: Filters, before?: string) {
  const p = new URLSearchParams();
  if (f.kind) p.set('kind', f.kind);
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.unused) p.set('unused', '1');
  if (f.folder) p.set('folder', f.folder);
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

function Thumb({ item, size = 160 }: { item: MediaItem; size?: number }) {
  const src = item.kind === 'image' ? thumbnailUrl(item.id, item.widths) : null;
  return src ? (
    <img src={src} alt="" width={size} height={Math.round((size * (item.height ?? 1)) / (item.width ?? 1))} />
  ) : (
    <span className="adm-media-ext" aria-hidden="true">
      {extension(item)}
    </span>
  );
}

const extension = (m: MediaItem) => m.original_name.split('.').pop()?.slice(0, 5).toUpperCase() || 'FILE';

const summary = (m: MediaItem) =>
  [m.kind === 'image' && m.width ? `${m.width}×${m.height}` : null, formatBytes(m.bytes)].filter(Boolean).join(' · ');

const use = (m: MediaItem) => (m.use_count ? `used in ${m.use_count}` : 'unused');

function FilterBar({
  filters,
  onChange,
  folders,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  /** The editor's picker chooses a folder here; the library has its folder bar instead. */
  folders?: MediaFolder[];
}) {
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
      {folders && (
        <label>
          Folder
          <select value={filters.folder ?? ''} onChange={(e) => onChange({ ...filters, q, folder: e.target.value })}>
            <option value="">All folders</option>
            <option value="none">Unsorted</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}
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
  const [filters, setFilters] = useState<Filters>({ kind: '', q: '', unused: false, folder: '' });
  const { items, setItems, more, failed, reload, loadMore } = useMediaList(filters);
  const { folders, reload: reloadFolders } = useFolders();
  const folder = filters.folder ?? '';
  const [view, setView] = useFolderView(folder);
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState('none');
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(0);
  const images = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const current = folders?.folders.find((f) => f.id === folder) ?? null;
  const folderName = (id: string | null | undefined) =>
    id ? (folders?.folders.find((f) => f.id === id)?.name ?? '') : 'Unsorted';

  function openFolder(id: string) {
    setFilters((f) => ({ ...f, folder: id }));
    setOpen(null);
    setSelected(new Set());
    setMessage('');
  }

  async function moveTo(ids: string[], to: string | null) {
    const { status, data } = await api<{ moved?: number; error?: string }>('/api/admin/media/move', {
      method: 'POST',
      body: { ids, folder: to },
    });
    if (status !== 200) {
      setMessage(`Not moved: ${data.error ?? 'try again'}.`);
      return false;
    }
    await Promise.all([reload(), reloadFolders()]);
    return true;
  }

  async function uploadAll(list: File[], kind: MediaKind) {
    // Into the open folder; from All media or Unsorted, into Unsorted.
    const into = current?.id ?? null;
    for (const file of list) {
      setUploading((n) => n + 1);
      try {
        const m = await upload(file, kind);
        if (m.duplicate) {
          setMessage(`“${file.name}” was already in the library.`);
          continue;
        }
        if (into) await moveTo([m.id], into);
        else await Promise.all([reload(), reloadFolders()]);
        setMessage(into ? `Uploaded “${m.original_name}” to ${current!.name}.` : `Uploaded “${m.original_name}”.`);
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

  async function createFolder(name: string) {
    const { status, data } = await api<{ id?: string; error?: string }>('/api/admin/media/folders', {
      method: 'POST',
      body: { name },
    });
    if (status !== 201) return `Not created: ${data.error ?? 'try again'}.`;
    await reloadFolders();
    openFolder(data.id!);
    setMessage(`Created the folder “${name.trim()}”.`);
    return null;
  }

  async function renameFolder(name: string) {
    const { status, data } = await api<{ error?: string }>(`/api/admin/media/folders/${current!.id}`, {
      method: 'PATCH',
      body: { name },
    });
    if (status !== 200) return `Not renamed: ${data.error ?? 'try again'}.`;
    await reloadFolders();
    setMessage('Renamed.');
    return null;
  }

  async function deleteFolder() {
    const gone = current!;
    const { status, data } = await api<{ moved?: number; error?: string }>(`/api/admin/media/folders/${gone.id}`, {
      method: 'DELETE',
    });
    if (status !== 200) return setMessage(`Not deleted: ${data.error ?? 'try again'}.`);
    await reloadFolders();
    openFolder('');
    setMessage(`Deleted the folder “${gone.name}”${data.moved ? `; its ${files(data.moved)} moved to Unsorted` : ''}.`);
  }

  async function moveSelected() {
    const ids = [...selected];
    const to = target === 'none' ? null : target;
    if (await moveTo(ids, to)) {
      setSelected(new Set());
      setMessage(`Moved ${files(ids.length)} to ${folderName(to)}.`);
    }
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const details = (m: MediaItem) => (
    <MediaDetails
      id={m.id}
      folders={folders?.folders ?? []}
      onChanged={(next) => setItems((list) => list?.map((x) => (x.id === next.id ? next : x)) ?? null)}
      onMove={async (to) => {
        if (await moveTo([m.id], to)) setMessage(`Moved “${m.original_name}” to ${folderName(to)}.`);
      }}
      onDeleted={() => {
        setItems((list) => list?.filter((x) => x.id !== m.id) ?? null);
        setOpen(null);
        setMessage(`Deleted “${m.original_name}”.`);
        void reloadFolders();
      }}
    />
  );

  const where = current ? current.name : folder === 'none' ? 'Unsorted' : 'All media';

  return (
    <>
      <div className="adm-head">
        <h1>Media</h1>
        <div className="adm-quick">
          <button type="button" className="btn pri" onClick={() => images.current?.click()}>
            Upload images
          </button>
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
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
            ref={fileInput}
            type="file"
            hidden
            multiple
            accept={FILE_ACCEPT}
            aria-label="Upload files"
            onChange={picked('file')}
          />
        </div>
      </div>
      <FolderBar folders={folders} current={folder} onOpen={openFolder} onCreate={createFolder} />
      {current && <FolderHead key={current.id} folder={current} onRename={renameFolder} onDelete={deleteFolder} />}
      <FilterBar filters={filters} onChange={setFilters} />
      <div className="adm-media-tools">
        <div role="group" aria-label="View" className="adm-view">
          <button type="button" className="btn" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
            Grid
          </button>
          <button type="button" className="btn" aria-pressed={view === 'list'} onClick={() => setView('list')}>
            List
          </button>
        </div>
        {selected.size > 0 && (
          <div className="adm-move" role="group" aria-label="Selected files">
            <span>{selected.size} selected</span>
            <label>
              Move to{' '}
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="none">Unsorted</option>
                {folders?.folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn pri" onClick={() => void moveSelected()}>
              Move
            </button>
            <button type="button" className="btn" onClick={() => setSelected(new Set())}>
              Clear selection
            </button>
          </div>
        )}
      </div>
      <p className="adm-live" role="status">
        {uploading ? `Uploading ${files(uploading)}…` : message}
      </p>
      {failed ? (
        <p role="alert" className="adm-error">
          The media library could not be loaded. Reload the page to try again.
        </p>
      ) : !items ? (
        <p aria-live="polite">Loading…</p>
      ) : items.length === 0 ? (
        <p className="empty">
          {filters.q || filters.kind || filters.unused
            ? 'Nothing matches.'
            : current
              ? 'This folder is empty. Upload here, or move files in from All media.'
              : folder === 'none'
                ? 'Nothing unsorted.'
                : 'Nothing uploaded yet.'}
        </p>
      ) : view === 'list' ? (
        <div className="adm-table-wrap">
          <table className="adm-table adm-media-table" aria-label={`Media in ${where}`}>
            <thead>
              <tr>
                <th scope="col">
                  <input
                    type="checkbox"
                    aria-label="Select all shown"
                    checked={items.every((m) => selected.has(m.id))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(items.map((m) => m.id)) : new Set())}
                  />
                </th>
                <th scope="col">Name</th>
                <th scope="col" className="adm-col-opt">
                  Type
                </th>
                <th scope="col">Size</th>
                <th scope="col" className="adm-col-opt">
                  Used
                </th>
                {!folder && (
                  <th scope="col" className="adm-col-opt">
                    Folder
                  </th>
                )}
                <th scope="col" className="adm-col-opt">
                  Uploaded
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <Fragment key={m.id}>
                  <tr className={open === m.id ? 'is-open' : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${m.original_name}`}
                        checked={selected.has(m.id)}
                        onChange={() => toggle(m.id)}
                      />
                    </td>
                    <th scope="row">
                      <button
                        type="button"
                        className="adm-media-row"
                        aria-expanded={open === m.id}
                        onClick={() => setOpen(open === m.id ? null : m.id)}
                      >
                        <Thumb item={m} size={40} />
                        <span className="adm-media-name">{m.original_name}</span>
                      </button>
                    </th>
                    <td className="adm-col-opt">{m.kind === 'image' ? 'Image' : extension(m)}</td>
                    <td>{summary(m)}</td>
                    <td className="adm-col-opt">{m.use_count ? m.use_count : '—'}</td>
                    {!folder && <td className="adm-col-opt">{folderName(m.folder_id)}</td>}
                    <td className="adm-col-opt">{new Date(m.created_at).toLocaleDateString('en-GB')}</td>
                  </tr>
                  {open === m.id && (
                    <tr className="adm-media-detail-row">
                      <td colSpan={folder ? 6 : 7}>{details(m)}</td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="adm-media" aria-label="Media">
          {items.map((m) => (
            <li key={m.id} className={open === m.id ? 'frame is-open' : 'frame'}>
              <input
                type="checkbox"
                className="adm-media-pick"
                aria-label={`Select ${m.original_name}`}
                checked={selected.has(m.id)}
                onChange={() => toggle(m.id)}
              />
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
              {open === m.id && details(m)}
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
  folders,
  onChanged,
  onMove,
  onDeleted,
}: {
  id: string;
  folders: MediaFolder[];
  onChanged: (m: MediaItem) => void;
  /** Into a folder, or back to Unsorted (null). */
  onMove: (folder: string | null) => Promise<void>;
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
      <label className="adm-media-folder">
        Folder
        <select
          value={detail.folder_id ?? ''}
          disabled={busy}
          onChange={async (e) => {
            const to = e.target.value || null;
            setBusy(true);
            await onMove(to);
            setBusy(false);
            setDetail({ ...detail, folder_id: to });
          }}
        >
          <option value="">Unsorted</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
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
  const [filters, setFilters] = useState<Filters>({ kind: '', q: '', unused: false, folder: '' });
  const { items, more, failed, loadMore } = useMediaList(filters);
  const { folders } = useFolders();
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
      <FilterBar filters={filters} onChange={setFilters} folders={folders?.folders ?? []} />
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
