import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/admin-api';
import type { MediaFolder, MediaFolders } from '@/server/media/library';

/**
 * Media folders (v1.1) for the library (./media-library.tsx): the folder bar, the open folder's
 * heading with Rename… and Delete…, the folder list, and each folder's grid or list view.
 */

export type View = 'grid' | 'list';

/** "1 file", "3 files". */
export const files = (n: number) => `${n} file${n === 1 ? '' : 's'}`;

/** The folders with their counts (v1.1); `reload` after anything that moves files. */
export function useFolders() {
  const [folders, setFolders] = useState<MediaFolders | null>(null);
  const reload = useCallback(async () => {
    const { status, data } = await api<MediaFolders>('/api/admin/media/folders');
    if (status === 200 && Array.isArray(data.folders)) setFolders(data);
  }, []);
  useEffect(() => {
    // Loading the folder list is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);
  return { folders, reload };
}

// Grid or list, remembered per folder on this device (a convenience: grid when storage is off).
const VIEW_KEY = 'cs-media-view';
function readViews(): Record<string, View> {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') as unknown;
    return v && typeof v === 'object' ? (v as Record<string, View>) : {};
  } catch {
    return {};
  }
}
export function useFolderView(folder: string) {
  const [views, setViews] = useState<Record<string, View>>({});
  useEffect(() => {
    // Reading this device's saved views once, after the first render, is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setViews(readViews());
  }, []);
  const key = folder || 'all';
  const set = (view: View) => {
    const next = { ...readViews(), [key]: view };
    setViews(next);
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(next));
    } catch {
      // Not saved; it still applies until the page is left.
    }
  };
  return [views[key] === 'list' ? 'list' : 'grid', set] as const;
}

/** v1.1: All media, Unsorted and each folder, with counts; and "New folder". */
export function FolderBar({
  folders,
  current,
  onOpen,
  onCreate,
}: {
  folders: MediaFolders | null;
  current: string;
  onOpen: (folder: string) => void;
  onCreate: (name: string) => Promise<string | null>;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const entries = [
    { id: '', name: 'All media', count: folders?.all },
    { id: 'none', name: 'Unsorted', count: folders?.unsorted },
    ...(folders?.folders ?? []).map((f) => ({ id: f.id, name: f.name, count: f.file_count })),
  ];
  return (
    <nav className="adm-folders" aria-label="Folders">
      <ul>
        {entries.map((f) => (
          <li key={f.id || 'all'}>
            <button type="button" className="btn" aria-pressed={f.id === current} onClick={() => onOpen(f.id)}>
              {f.count === undefined ? f.name : `${f.name} (${f.count})`}
            </button>
          </li>
        ))}
        <li>
          {adding ? (
            <form
              className="adm-folder-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const failed = await onCreate(name);
                if (failed) return setError(failed);
                setAdding(false);
                setName('');
                setError('');
              }}
            >
              <label className="sr-only" htmlFor="adm-new-folder">
                New folder name
              </label>
              <input
                id="adm-new-folder"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                required
                // The form opened because the owner asked for it.
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                placeholder="Folder name"
              />
              <button type="submit" className="btn pri" disabled={!name.trim()}>
                Create
              </button>
              <button type="button" className="btn" onClick={() => (setAdding(false), setError(''))}>
                Cancel
              </button>
            </form>
          ) : (
            <button type="button" className="btn" onClick={() => setAdding(true)}>
              + New folder
            </button>
          )}
        </li>
      </ul>
      {error && (
        <p role="alert" className="adm-error">
          {error}
        </p>
      )}
    </nav>
  );
}

/** The open folder's name with Rename… and Delete… (only for real folders, not All or Unsorted). */
export function FolderHead({
  folder,
  onRename,
  onDelete,
}: {
  folder: MediaFolder;
  onRename: (name: string) => Promise<string | null>;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(folder.name);
  const [error, setError] = useState('');
  return (
    <div className="adm-folder-head">
      {renaming ? (
        <form
          className="adm-folder-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const failed = await onRename(name);
            if (failed) return setError(failed);
            setRenaming(false);
            setError('');
          }}
        >
          <label className="sr-only" htmlFor="adm-rename-folder">
            Folder name
          </label>
          <input
            id="adm-rename-folder"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            required
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          <button type="submit" className="btn pri" disabled={!name.trim()}>
            Save name
          </button>
          <button type="button" className="btn" onClick={() => (setRenaming(false), setName(folder.name))}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          <h2>{folder.name}</h2>
          <button type="button" className="btn" onClick={() => setRenaming(true)}>
            Rename…
          </button>
          {confirming ? (
            <span className="adm-confirm" role="group" aria-label="Confirm delete">
              Delete the folder “{folder.name}”?
              {folder.file_count > 0 && ` Its ${files(folder.file_count)} move to Unsorted.`}
              <button type="button" className="btn adm-danger" onClick={onDelete}>
                Delete folder
              </button>
              <button type="button" className="btn" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" className="btn" onClick={() => setConfirming(true)}>
              Delete folder…
            </button>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="adm-error">
          {error}
        </p>
      )}
    </div>
  );
}
