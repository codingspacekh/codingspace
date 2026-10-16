import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/admin-api';
import type { RevisionItem } from '@/server/admin/posts';

const REASONS: Record<RevisionItem['reason'], string> = {
  autosave: 'Autosaved',
  publish: 'Published',
  restore: 'Restored',
  before_restore: 'Before a restore',
};

const TIME = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Phnom_Penh',
});

/**
 * 03 ADM-06: the draft's history. Pick a version to see it as students would, then restore it.
 * `onRestore` saves any pending edits first and returns false if the restore didn't happen.
 */
export function RevisionHistory({
  postId,
  refreshKey,
  onRestore,
}: {
  postId: string;
  refreshKey: number;
  onRestore: (revisionId: number) => Promise<boolean>;
}) {
  const [items, setItems] = useState<RevisionItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<RevisionItem | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current = true;
    api<{ revisions?: RevisionItem[] }>(`/api/admin/posts/${postId}/revisions`).then(({ status, data }) => {
      if (!current) return;
      setFailed(status !== 200);
      if (status === 200) setItems(data.revisions ?? []);
    });
    return () => {
      current = false;
    };
  }, [postId, refreshKey]);

  async function open(item: RevisionItem) {
    setSelected(item);
    setConfirming(false);
    setPreview(null);
    setPreviewFailed(false);
    const { status, data } = await api<{ html?: string }>(`/api/admin/posts/${postId}/revisions/${item.id}`);
    if (status === 200) setPreview(data.html ?? '');
    else setPreviewFailed(true);
    previewRef.current?.focus();
  }

  async function restore() {
    if (!selected) return;
    setBusy(true);
    const ok = await onRestore(selected.id);
    setBusy(false);
    if (ok) {
      setSelected(null);
      setConfirming(false);
    }
  }

  return (
    <section className="ed-settings ed-history" aria-labelledby="history-h">
      <h2 id="history-h">History</h2>
      {failed ? (
        <p role="alert" className="adm-error">
          The history could not be loaded.
        </p>
      ) : !items ? (
        <p aria-live="polite">Loading…</p>
      ) : items.length === 0 ? (
        <p className="adm-hint">
          No earlier versions yet. One is kept every 10 minutes while you edit, and at every publish.
        </p>
      ) : (
        <ol className="ed-revisions">
          {items.map((r) => (
            <li key={r.id}>
              <button type="button" aria-pressed={selected?.id === r.id} onClick={() => open(r)}>
                <span>{TIME.format(new Date(r.created_at))}</span>
                <span className="adm-slug">{REASONS[r.reason]}</span>
                <strong>{r.title || 'Untitled'}</strong>
              </button>
            </li>
          ))}
        </ol>
      )}

      {selected && (
        <div
          className="ed-revision"
          ref={previewRef}
          tabIndex={-1}
          aria-label={`Version from ${TIME.format(new Date(selected.created_at))}`}
        >
          {confirming ? (
            <div className="adm-confirm" role="group" aria-label="Confirm restore">
              <span>
                Replace the current draft with this version? The current draft stays in the history, so you can undo
                this.
              </span>
              <button type="button" className="btn pri" onClick={restore} disabled={busy}>
                Restore this version
              </button>
              <button type="button" className="btn" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="btn pri" onClick={() => setConfirming(true)}>
              Restore…
            </button>
          )}
          <h3>{selected.title || 'Untitled'}</h3>
          {previewFailed ? (
            <p role="alert" className="adm-error">
              The preview could not be loaded.
            </p>
          ) : preview === null ? (
            <p aria-live="polite">Loading the preview…</p>
          ) : (
            // The renderer's own sanitised output, as on lesson pages.
            <div className="prose ed-revision-body" dangerouslySetInnerHTML={{ __html: preview }} />
          )}
        </div>
      )}
    </section>
  );
}
