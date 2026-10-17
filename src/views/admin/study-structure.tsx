import Link from 'next/link';
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { api } from '@/lib/admin-api';
import { moveItem } from '@/lib/post-rules';
import { SUBJECT_IDS, SUBJECTS, type SubjectId } from '@/lib/subjects';
import type { StructureSection } from '@/server/admin/sections';
import { Modal } from './modal';
import { StatusBadge } from './posts-browser';

type Reply = { error?: string; failed?: string[] };

/**
 * 03 ADM-12: a subject's sections — add, rename, describe, reorder, delete (only when empty) —
 * and the order of the lessons inside each one. Every change rebuilds the pages that show it.
 */
export function StudyStructure({ subject, onSubject }: { subject: SubjectId; onSubject: (s: SubjectId) => void }) {
  const [sections, setSections] = useState<StructureSection[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { status, data } = await api<{ sections?: StructureSection[] }>(`/api/admin/sections?subject=${subject}`);
    setFailed(status !== 200);
    if (status === 200) setSections(data.sections ?? []);
  }, [subject]);

  useEffect(() => {
    // Loading the subject's sections is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /** Runs a change; on failure reloads, so the screen matches the database again. */
  async function change(request: () => Promise<{ status: number; data: Reply }>, done: string) {
    setBusy(true);
    const { status, data } = await request().catch(() => ({ status: 0, data: {} as Reply }));
    setBusy(false);
    if (status === 200 || status === 201) {
      setMessage(data.failed?.length ? `${done} Some pages will catch up within 5 minutes.` : done);
      return true;
    }
    setMessage(`Not done: ${data.error ?? 'try again'}.`);
    await load();
    return false;
  }

  function moveSection(index: number, delta: -1 | 1) {
    if (!sections) return;
    const next = moveItem(sections, index, delta);
    setSections(next);
    void change(
      () =>
        api('/api/admin/sections/order', { method: 'PUT', body: { subject_id: subject, ids: next.map((s) => s.id) } }),
      `Moved “${sections[index]!.title}” ${delta < 0 ? 'up' : 'down'}.`,
    );
  }

  function moveLesson(section: StructureSection, index: number, delta: -1 | 1) {
    const lessons = moveItem(section.lessons, index, delta);
    setSections((list) => list?.map((s) => (s.id === section.id ? { ...s, lessons } : s)) ?? null);
    void change(
      () =>
        api(`/api/admin/sections/${section.id}/lessons`, { method: 'PUT', body: { ids: lessons.map((l) => l.id) } }),
      `Moved “${section.lessons[index]!.title || 'Untitled'}” ${delta < 0 ? 'up' : 'down'}.`,
    );
  }

  return (
    <>
      <div className="adm-head">
        <h1>Study structure</h1>
        <button type="button" className="btn pri" onClick={() => setAdding(true)}>
          New section
        </button>
      </div>
      <div role="group" aria-label="Subject" className="ed-panels adm-subjects">
        {SUBJECT_IDS.map((s) => (
          <button key={s} type="button" className="btn" aria-pressed={s === subject} onClick={() => onSubject(s)}>
            {SUBJECTS[s].name}
          </button>
        ))}
      </div>
      <p className="adm-live" role="status">
        {message}
      </p>
      {failed ? (
        <p role="alert" className="adm-error">
          The sections could not be loaded. Reload the page to try again.
        </p>
      ) : !sections ? (
        <p aria-live="polite">Loading…</p>
      ) : (
        <>
          {sections.length === 0 ? (
            <p className="empty">{SUBJECTS[subject].name} has no sections yet. Add the first one with New section.</p>
          ) : (
            <ol className="adm-sections">
              {sections.map((s, i) => (
                <SectionCard
                  key={s.id}
                  section={s}
                  first={i === 0}
                  last={i === sections.length - 1}
                  busy={busy}
                  onMove={(d) => moveSection(i, d)}
                  onMoveLesson={(li, d) => moveLesson(s, li, d)}
                  onSave={async (title, description) => {
                    const ok = await change(
                      () => api(`/api/admin/sections/${s.id}`, { method: 'PATCH', body: { title, description } }),
                      `Saved “${title}”.`,
                    );
                    if (ok)
                      setSections(
                        (list) => list?.map((x) => (x.id === s.id ? { ...x, title, description } : x)) ?? null,
                      );
                    return ok;
                  }}
                  onDelete={async () => {
                    const ok = await change(
                      () => api(`/api/admin/sections/${s.id}`, { method: 'DELETE' }),
                      `Deleted “${s.title}”.`,
                    );
                    if (ok) setSections((list) => list?.filter((x) => x.id !== s.id) ?? null);
                  }}
                />
              ))}
            </ol>
          )}
        </>
      )}
      {adding && (
        <AddSection
          subject={subject}
          busy={busy}
          onCancel={() => setAdding(false)}
          onAdd={async (title, description) => {
            const ok = await change(
              () => api('/api/admin/sections', { method: 'POST', body: { subject_id: subject, title, description } }),
              `Added “${title}” at the end.`,
            );
            if (ok) {
              setAdding(false);
              await load();
            }
          }}
        />
      )}
    </>
  );
}

function SectionCard({
  section: s,
  first,
  last,
  busy,
  onMove,
  onMoveLesson,
  onSave,
  onDelete,
}: {
  section: StructureSection;
  first: boolean;
  last: boolean;
  busy: boolean;
  onMove: (delta: -1 | 1) => void;
  onMoveLesson: (index: number, delta: -1 | 1) => void;
  onSave: (title: string, description: string) => Promise<boolean>;
  onDelete: () => void;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(s.title);
  const [description, setDescription] = useState(s.description);
  const [confirming, setConfirming] = useState(false);
  const [open, setOpen] = useState(false);
  const count = s.lessons.length;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (await onSave(title.trim(), description.trim())) setEditing(false);
  }

  return (
    <li className="frame adm-section" aria-labelledby={`${id}-t`}>
      {editing ? (
        <form className="adm-form" onSubmit={save} aria-label={`Edit ${s.title}`}>
          <label>
            Title
            <input value={title} maxLength={120} required onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            Description
            <textarea rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <p className="adm-hint">The address stays /study/…#{s.slug}, so links keep working.</p>
          <div className="adm-quick">
            <button type="submit" className="btn pri" disabled={busy || !title.trim()}>
              Save
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setTitle(s.title);
                setDescription(s.description);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <h2 id={`${id}-t`}>{s.title}</h2>
          {s.description && <p>{s.description}</p>}
          <p className="meta">
            {count === 0 ? 'No lessons' : `${count} lesson${count === 1 ? '' : 's'}`} · #{s.slug}
          </p>
        </>
      )}

      {!editing && (
        <div className="adm-quick">
          <button
            type="button"
            className="btn"
            disabled={busy || first}
            onClick={() => onMove(-1)}
            aria-label={`Move ${s.title} up`}
          >
            ↑
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || last}
            onClick={() => onMove(1)}
            aria-label={`Move ${s.title} down`}
          >
            ↓
          </button>
          <button type="button" className="btn" onClick={() => setEditing(true)} aria-label={`Edit ${s.title}`}>
            Edit
          </button>
          {count > 0 && (
            <button
              type="button"
              className="btn"
              aria-expanded={open}
              aria-controls={`${id}-l`}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? 'Hide lessons' : 'Order lessons'}
            </button>
          )}
          {confirming ? (
            <span className="adm-confirm" role="group" aria-label="Confirm delete">
              <span>Delete “{s.title}”? This can’t be undone.</span>
              <button type="button" className="btn adm-danger" disabled={busy} onClick={onDelete}>
                Delete permanently
              </button>
              <button type="button" className="btn" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="btn"
              disabled={count > 0}
              aria-describedby={count > 0 ? `${id}-del` : undefined}
              aria-label={`Delete ${s.title}`}
              onClick={() => setConfirming(true)}
            >
              Delete
            </button>
          )}
          {count > 0 && (
            <span id={`${id}-del`} className="adm-hint">
              To delete it, move or delete its {count} lesson{count === 1 ? '' : 's'} first.
            </span>
          )}
        </div>
      )}

      {open && (
        <ol id={`${id}-l`} className="adm-lessons" aria-label={`Lessons in ${s.title}, in order`}>
          {s.lessons.map((l, i) => (
            <li key={l.id}>
              <span className="adm-order">{i + 1}.</span>
              <Link href={`/admin/posts/${l.id}`}>{l.title || 'Untitled'}</Link>
              <StatusBadge post={{ status: l.status as 'draft', has_unpublished_changes: l.has_unpublished_changes }} />
              <span className="adm-quick">
                <button
                  type="button"
                  className="btn"
                  disabled={busy || i === 0}
                  onClick={() => onMoveLesson(i, -1)}
                  aria-label={`Move ${l.title || 'Untitled'} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy || i === s.lessons.length - 1}
                  onClick={() => onMoveLesson(i, 1)}
                  aria-label={`Move ${l.title || 'Untitled'} down`}
                >
                  ↓
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

/** New section, in a modal (like New problem: the form shows only when asked for). */
function AddSection({
  subject,
  busy,
  onAdd,
  onCancel,
}: {
  subject: SubjectId;
  busy: boolean;
  onAdd: (title: string, description: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const name = `Add a section to ${SUBJECTS[subject].name}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    await onAdd(title.trim(), description.trim());
  }

  return (
    <Modal title={name} onClose={onCancel}>
      <form className="adm-form" onSubmit={submit} aria-label={name}>
        <label>
          Title
          <input value={title} maxLength={120} required onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Description (optional)
          <textarea rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <p className="adm-hint">
          It goes at the end, and shows on the subject page as “coming soon” until it has a lesson.
        </p>
        <div className="adm-quick">
          <button type="submit" className="btn pri" disabled={busy || !title.trim()}>
            Add section
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
