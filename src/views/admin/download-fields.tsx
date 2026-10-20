import { useEffect, useId, useRef, useState } from 'react';
import { APP_ACCEPT, extensionOf, formatBytes } from '@/lib/media-rules';
import type { UploadedMedia, UploadProgress } from '@/lib/media-upload';
import { moveItem } from '@/lib/post-rules';
import {
  DOWNLOAD_PLATFORMS,
  isFileDownload,
  PROJECT_LIMITS,
  PROJECT_TEXT,
  type DownloadPlatform,
  type ProjectDownload,
} from '@/lib/project-page';
import { landingUrlProblem } from '@/lib/site-rules';
import { MediaPicker } from './media-library';

/**
 * A project's download buttons (2026-10-20): each one serves a file uploaded here (an app, up to
 * 2 GB, sent in parts) or links to a file elsewhere. Order, label, note and computer per button.
 */

export type AppUpload = (
  file: File,
  o: { onProgress?: (p: UploadProgress) => void; signal?: AbortSignal },
) => Promise<UploadedMedia>;

type StoredFile = { media: string; name: string; bytes: number; sha256: string };

/** One button as the form edits it. `key` only keeps rows apart while they change. */
export type AdminDownload = {
  key: string;
  label: string;
  note: string;
  platform: DownloadPlatform | '';
  url: string;
  file: StoredFile | null;
  /** Still being uploaded: saving waits. */
  uploading?: boolean;
};

let lastKey = 0;
const newKey = () => `d${++lastKey}`;

export const toAdminDownload = (d: ProjectDownload): AdminDownload => ({
  key: newKey(),
  label: d.label,
  note: d.note ?? '',
  platform: d.platform ?? '',
  url: isFileDownload(d) ? '' : d.url,
  file: isFileDownload(d) ? { media: d.media, name: d.name, bytes: d.bytes, sha256: d.sha256 } : null,
});

/** What the server takes: a file by its id (the database copies the rest), or a link. */
export const downloadBody = ({ label, note, platform, url, file }: AdminDownload) =>
  file ? { label, note, platform, media: file.media } : { label, note, platform, url };

const isEmpty = (d: AdminDownload) => !d.file && !d.uploading && ![d.label, d.note, d.url].some((v) => v.trim());

/** What stops saving, if anything; rows left completely empty are dropped instead. */
export function downloadsProblem(downloads: AdminDownload[]): string | null {
  for (const d of downloads.filter((x) => !isEmpty(x))) {
    if (d.uploading) return 'Wait for the uploads to finish (or cancel them).';
    if (!d.label.trim()) return 'Every download needs a label, like Windows.';
    if (!d.file) {
      const problem = landingUrlProblem(d.url);
      if (problem) return `Download “${d.label}”: ${problem}`;
    }
  }
  return null;
}

export const keptDownloads = (downloads: AdminDownload[]) => downloads.filter((d) => !isEmpty(d));

/** A first guess from the file's name, so most uploads need no typing. */
export function guessDownload(name: string): Pick<AdminDownload, 'label' | 'note' | 'platform'> {
  const ext = extensionOf(name);
  const n = name.toLowerCase();
  if (ext === 'dmg' || ext === 'pkg' || /mac|darwin/.test(n)) {
    const platform = /arm64|apple|silicon|aarch64/.test(n) ? 'mac-arm' : /x64|x86|intel/.test(n) ? 'mac-intel' : 'mac';
    return { label: platform === 'mac' ? 'macOS' : DOWNLOAD_PLATFORMS[platform], note: '', platform };
  }
  if (ext === 'apk') return { label: 'Android', note: '', platform: 'android' };
  if (ext === 'exe' || ext === 'msi') return { label: 'Windows', note: 'Installer', platform: 'windows' };
  if (/win/.test(n)) return { label: 'Windows portable', note: 'No install: unzip and run', platform: 'windows' };
  return { label: '', note: '', platform: '' };
}

type Status = { sent: number; total: number } | { error: string };

export function DownloadsEditor({
  downloads,
  uploadApp,
  onChange,
}: {
  downloads: AdminDownload[];
  uploadApp: AppUpload;
  /** Takes an update: uploads finish one after another, long after they start. */
  onChange: (update: (prev: AdminDownload[]) => AdminDownload[]) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const running = useRef(new Map<string, AbortController>());
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState('');
  const [over, setOver] = useState(false);
  const full = downloads.length >= PROJECT_LIMITS.downloads;
  // Closing the form cancels what is still going up.
  useEffect(() => {
    const live = running.current;
    return () => live.forEach((c) => c.abort());
  }, []);

  const patch = (key: string, change: Partial<AdminDownload>) =>
    onChange((prev) => prev.map((d) => (d.key === key ? { ...d, ...change } : d)));
  const remove = (key: string) => {
    running.current.get(key)?.abort();
    onChange((prev) => prev.filter((d) => d.key !== key));
  };

  async function send(file: File) {
    const key = newKey();
    const controller = new AbortController();
    running.current.set(key, controller);
    onChange((prev) => [...prev, { key, url: '', file: null, uploading: true, ...guessDownload(file.name) }]);
    try {
      const m = await uploadApp(file, {
        signal: controller.signal,
        onProgress: (p) => setStatus((s) => ({ ...s, [key]: p })),
      });
      patch(key, {
        uploading: false,
        file: { media: m.id, name: m.original_name, bytes: m.bytes, sha256: '' },
      });
      setStatus((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setNote(
        `“${file.name}” uploaded${m.duplicate ? ' (it was already in the library)' : ''}. Save to show it on the page.`,
      );
    } catch (e) {
      if (controller.signal.aborted) return;
      patch(key, { uploading: false });
      setStatus((s) => ({ ...s, [key]: { error: e instanceof Error ? e.message : 'Try again.' } }));
    } finally {
      running.current.delete(key);
    }
  }

  const chosen = (files: File[]) => {
    const room = PROJECT_LIMITS.downloads - downloads.length;
    if (files.length > room)
      setNote(`Only ${room} more download${room === 1 ? '' : 's'} fit (at most ${PROJECT_LIMITS.downloads}).`);
    files.slice(0, Math.max(0, room)).forEach((f) => void send(f));
  };

  return (
    <fieldset className="adm-fieldset">
      <legend>Downloads</legend>
      <p className="adm-hint">
        One button each. Upload the installer here (.exe, .msi, .dmg, .pkg, .zip or .apk, up to 2 GB), or add a link to
        a file elsewhere. With none, the page says “Coming soon”.
      </p>
      {downloads.length > 0 && (
        <ol className="adm-pj-list adm-dl-list" aria-label="Downloads">
          {downloads.map((d, i) => {
            const s = status[d.key];
            return (
              <li key={d.key}>
                {d.file ? (
                  <p className="adm-dl-file">
                    <b>{d.file.name}</b> <span className="meta">{formatBytes(d.file.bytes)}</span>
                  </p>
                ) : d.uploading ? (
                  <div className="adm-dl-file">
                    <b>{d.label || 'Uploading'}</b>
                    <progress
                      max={s && 'total' in s ? s.total : 1}
                      value={s && 'sent' in s ? s.sent : 0}
                      aria-label={`Upload of download ${i + 1}`}
                    />
                    <span className="meta">
                      {s && 'sent' in s ? `${formatBytes(s.sent)} of ${formatBytes(s.total)}` : 'Starting…'}
                    </span>
                  </div>
                ) : s && 'error' in s ? (
                  <p className="adm-error" role="alert">
                    The upload failed: {s.error}
                  </p>
                ) : (
                  <label>
                    Link
                    <input
                      id={`${id}-${d.key}-url`}
                      type="url"
                      inputMode="url"
                      maxLength={500}
                      value={d.url}
                      onChange={(e) => patch(d.key, { url: e.target.value })}
                    />
                  </label>
                )}
                <label>
                  Label (e.g. Windows, macOS)
                  <input
                    id={`${id}-${d.key}-label`}
                    maxLength={PROJECT_TEXT.label}
                    value={d.label}
                    onChange={(e) => patch(d.key, { label: e.target.value })}
                  />
                </label>
                <label>
                  Note (optional, e.g. Installer)
                  <input
                    id={`${id}-${d.key}-note`}
                    maxLength={PROJECT_TEXT.note}
                    value={d.note}
                    onChange={(e) => patch(d.key, { note: e.target.value })}
                  />
                </label>
                <label>
                  For
                  <select
                    id={`${id}-${d.key}-platform`}
                    value={d.platform}
                    onChange={(e) => patch(d.key, { platform: e.target.value as AdminDownload['platform'] })}
                  >
                    <option value="">Any computer</option>
                    {Object.entries(DOWNLOAD_PLATFORMS).map(([value, name]) => (
                      <option key={value} value={value}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="adm-quick">
                  <button
                    type="button"
                    className="btn"
                    disabled={i === 0}
                    aria-label={`Move download ${i + 1} up`}
                    onClick={() => onChange((prev) => moveItem(prev, i, -1))}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={i === downloads.length - 1}
                    aria-label={`Move download ${i + 1} down`}
                    onClick={() => onChange((prev) => moveItem(prev, i, 1))}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn"
                    aria-label={`${d.uploading ? 'Cancel' : 'Remove'} download ${i + 1}`}
                    onClick={() => remove(d.key)}
                  >
                    {d.uploading ? 'Cancel' : 'Remove'}
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <div
        className={`adm-dl-drop${over ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!full) chosen([...e.dataTransfer.files]);
        }}
      >
        <p>Drop installers here, or:</p>
        <div className="adm-quick">
          <button type="button" className="btn" disabled={full} onClick={() => input.current?.click()}>
            Upload installers
          </button>
          <button type="button" className="btn" disabled={full} onClick={() => setPicking(true)}>
            Choose from the media library
          </button>
          <button
            type="button"
            className="btn"
            disabled={full}
            onClick={() =>
              onChange((prev) => [...prev, { key: newKey(), label: '', note: '', platform: '', url: '', file: null }])
            }
          >
            Add a link
          </button>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept={APP_ACCEPT}
        multiple
        hidden
        aria-label="Upload installers"
        onChange={(e) => {
          chosen([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      <p className="adm-live" role="status">
        {note}
      </p>
      {picking && (
        <MediaPicker
          onClose={() => setPicking(false)}
          onPick={(m) => {
            setPicking(false);
            if (m.kind !== 'app') return setNote('Choose an app (Type: Apps), not an image or a document.');
            onChange((prev) => [
              ...prev,
              {
                key: newKey(),
                url: '',
                file: { media: m.id, name: m.original_name, bytes: m.bytes, sha256: '' },
                ...guessDownload(m.original_name),
              },
            ]);
            setNote(`“${m.original_name}” added. Save to show it on the page.`);
          }}
        />
      )}
    </fieldset>
  );
}
