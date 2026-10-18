import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { api } from '@/lib/admin-api';
import { moveItem } from '@/lib/post-rules';
import { useSubjects } from '@/lib/subjects';
import { parsePoints } from '@/lib/syllabus';
import type { AdminPoint, AdminSyllabus } from '@/server/admin/syllabus';

type Reply = { error?: string; failed?: string[] };
type Fields = { code: string; title: string; description: string; subject_id: string | null };
/** A point being edited; new ones have no id yet. */
type PointRow = { id?: string; code: string; title: string; lessons: number };

const EMPTY: Fields = { code: '', title: '', description: '', subject_id: null };
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/**
 * v1.1 (owner request 2026-10-18): the syllabuses taught here and their points, built by the
 * owner (codes and titles as in the syllabus document). Lessons are tagged with points in the
 * lesson editor; visitors see /syllabus/<slug>, point by point, with the lessons for each.
 */
export function SyllabusAdmin() {
  const [syllabuses, setSyllabuses] = useState<AdminSyllabus[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { status, data } = await api<{ syllabuses?: AdminSyllabus[] }>('/api/admin/syllabuses');
    setFailed(status !== 200);
    if (status === 200) setSyllabuses(data.syllabuses ?? []);
  }, []);

  useEffect(() => {
    // Loading the syllabuses is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /** Runs a change, then reloads so the screen matches the database. */
  async function change(request: () => Promise<{ status: number; data: Reply }>, done: string) {
    setBusy(true);
    const { status, data } = await request().catch(() => ({ status: 0, data: {} as Reply }));
    setBusy(false);
    const ok = status === 200 || status === 201;
    setMessage(
      ok
        ? data.failed?.length
          ? `${done} Some pages will catch up within 5 minutes.`
          : done
        : `Not done: ${data.error ?? 'try again'}.`,
    );
    await load();
    return ok;
  }

  function move(index: number, delta: -1 | 1) {
    if (!syllabuses) return;
    const next = moveItem(syllabuses, index, delta);
    setSyllabuses(next);
    void change(
      () => api('/api/admin/syllabuses/order', { method: 'PUT', body: { ids: next.map((s) => s.id) } }),
      `Moved “${syllabuses[index]!.title}” ${delta < 0 ? 'up' : 'down'}.`,
    );
  }

  return (
    <>
      <h1>Syllabus</h1>
      <p className="adm-lead">
        The syllabuses you teach and their points, as in the syllabus document. Tag lessons with points in the lesson
        editor (Settings → Syllabus points). Visitors see each syllabus point by point, with its lessons.
      </p>
      <p className="adm-live" role="status">
        {message}
      </p>
      {failed ? (
        <p role="alert" className="adm-error">
          The syllabuses could not be loaded. Reload the page to try again.
        </p>
      ) : !syllabuses ? (
        <p aria-live="polite">Loading…</p>
      ) : (
        <>
          {syllabuses.length === 0 ? (
            <p className="empty">No syllabus yet. Add the first one below.</p>
          ) : (
            <ol className="adm-sections" aria-label="Syllabuses, in order">
              {syllabuses.map((s, i) => (
                <SyllabusCard
                  key={s.id}
                  syllabus={s}
                  first={i === 0}
                  last={i === syllabuses.length - 1}
                  busy={busy}
                  onMove={(d) => move(i, d)}
                  onSave={(f) =>
                    change(
                      () => api(`/api/admin/syllabuses/${s.id}`, { method: 'PUT', body: f }),
                      `Saved “${f.title}”.`,
                    )
                  }
                  onSavePoints={(points) =>
                    change(
                      () =>
                        api(`/api/admin/syllabuses/${s.id}/points`, {
                          method: 'PUT',
                          body: points.map(({ id, code, title }) => (id ? { id, code, title } : { code, title })),
                        }),
                      `Saved the ${plural(points.length, 'point')} of “${s.title}”.`,
                    )
                  }
                  onDelete={() =>
                    change(() => api(`/api/admin/syllabuses/${s.id}`, { method: 'DELETE' }), `Deleted “${s.title}”.`)
                  }
                />
              ))}
            </ol>
          )}
          <section className="frame adm-section" aria-labelledby="add-syllabus">
            <h2 id="add-syllabus">Add a syllabus</h2>
            <SyllabusForm
              initial={EMPTY}
              label="Add a syllabus"
              submit="Add syllabus"
              busy={busy}
              onSubmit={(f) =>
                change(
                  () => api('/api/admin/syllabuses', { method: 'POST', body: f }),
                  `Added “${f.title}”. Now add its points.`,
                )
              }
            />
          </section>
        </>
      )}
    </>
  );
}

function SyllabusCard({
  syllabus: s,
  first,
  last,
  busy,
  onMove,
  onSave,
  onSavePoints,
  onDelete,
}: {
  syllabus: AdminSyllabus;
  first: boolean;
  last: boolean;
  busy: boolean;
  onMove: (delta: -1 | 1) => void;
  onSave: (f: Fields) => Promise<boolean>;
  onSavePoints: (points: PointRow[]) => Promise<boolean>;
  onDelete: () => void;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const tagged = s.points.reduce((n, p) => n + p.lessons, 0);

  return (
    <li className="frame adm-section" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`}>
        {s.title} <span className="adm-status">{s.code}</span>
      </h2>
      {editing ? (
        <SyllabusForm
          initial={{ code: s.code, title: s.title, description: s.description, subject_id: s.subject_id }}
          label={`Edit ${s.title}`}
          submit="Save"
          busy={busy}
          onSubmit={async (f) => {
            const ok = await onSave(f);
            if (ok) setEditing(false);
            return ok;
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          {s.description && <p>{s.description}</p>}
          <p className="meta">
            {plural(s.points.length, 'point')} · {plural(tagged, 'lesson tag')} ·{' '}
            {s.points.length ? (
              <a href={`/syllabus/${s.slug}`} target="_blank" rel="noopener">
                /syllabus/{s.slug}
              </a>
            ) : (
              `/syllabus/${s.slug} (shown once it has points)`
            )}
          </p>
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
            {confirming ? (
              <span className="adm-confirm" role="group" aria-label="Confirm delete">
                Delete “{s.title}” and its points? Lessons stay; they lose these tags.
                <button type="button" className="btn adm-danger" disabled={busy} onClick={onDelete}>
                  Delete syllabus
                </button>
                <button type="button" className="btn" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={() => setConfirming(true)}
                aria-label={`Delete ${s.title}`}
              >
                Delete…
              </button>
            )}
          </div>
          <details className="adm-pj-part">
            <summary>
              Points <span className="meta">{plural(s.points.length, 'point')}</span>
            </summary>
            {/* Saved points get ids: start again from what was saved. */}
            <PointsEditor key={s.points.map((p) => p.id).join()} syllabus={s} busy={busy} onSave={onSavePoints} />
          </details>
        </>
      )}
    </li>
  );
}

/** A syllabus's points: edit, reorder, remove, add one, or paste a list from the syllabus document. */
function PointsEditor({
  syllabus: s,
  busy,
  onSave,
}: {
  syllabus: AdminSyllabus;
  busy: boolean;
  onSave: (points: PointRow[]) => Promise<boolean>;
}) {
  const id = useId();
  const [rows, setRows] = useState<PointRow[]>(s.points);
  const [paste, setPaste] = useState('');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const set = (i: number, k: 'code' | 'title', v: string) =>
    setRows((list) => list.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const codes = rows.map((r) => r.code.trim().toLowerCase());
  const problem = rows.some((r) => !r.code.trim() || !r.title.trim())
    ? 'Every point needs a code and a title.'
    : codes.some((c, i) => codes.indexOf(c) !== i)
      ? 'Two points have the same code.'
      : null;
  const dropping = s.points.filter((p) => p.lessons > 0 && !rows.some((r) => r.id === p.id));

  function addPasted() {
    const { points, problems } = parsePoints(paste);
    setRows((list) => [...list, ...points.map((p) => ({ ...p, lessons: 0 }))]);
    setNote(
      [points.length ? `Added ${plural(points.length, 'point')} below. Save to keep them.` : '', ...problems]
        .filter(Boolean)
        .join(' '),
    );
    if (!problems.length) setPaste('');
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (problem) return;
    if (await onSave(rows)) setTouched(false);
  }

  return (
    <form className="adm-form" onSubmit={save} aria-label={`Points of ${s.title}`} noValidate>
      {rows.length > 0 && (
        <ol className="adm-pj-list adm-points" aria-label={`Points of ${s.title}`}>
          {rows.map((r, i) => (
            <li key={r.id ?? `new-${i}`}>
              <span className="adm-row adm-point">
                <label>
                  Code
                  <input value={r.code} maxLength={20} onChange={(e) => set(i, 'code', e.target.value)} />
                </label>
                <label>
                  Title
                  <input value={r.title} maxLength={160} onChange={(e) => set(i, 'title', e.target.value)} />
                </label>
              </span>
              <span className="adm-quick">
                {r.lessons > 0 && <span className="meta">{plural(r.lessons, 'lesson')}</span>}
                <button
                  type="button"
                  className="btn"
                  disabled={i === 0}
                  aria-label={`Move point ${r.code || i + 1} up`}
                  onClick={() => setRows((list) => moveItem(list, i, -1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={i === rows.length - 1}
                  aria-label={`Move point ${r.code || i + 1} down`}
                  onClick={() => setRows((list) => moveItem(list, i, 1))}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn"
                  aria-label={`Remove point ${r.code || i + 1}`}
                  onClick={() => setRows((list) => list.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <button
        type="button"
        className="btn"
        onClick={() => setRows((list) => [...list, { code: '', title: '', lessons: 0 }])}
      >
        Add a point
      </button>
      <label>
        Or paste a list, one point per line (e.g. “1.1 Data representation”)
        <textarea
          id={`${id}-paste`}
          rows={4}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={'1.1 Data representation\n1.2 Multimedia\n1.3 Compression'}
        />
      </label>
      <button type="button" className="btn" disabled={!paste.trim()} onClick={addPasted}>
        Add the pasted points
      </button>
      <p className="adm-live" role="status">
        {note}
      </p>
      {dropping.length > 0 && (
        <p className="adm-hint">
          Saving removes {dropping.map((p: AdminPoint) => p.code).join(', ')} and their lesson tags.
        </p>
      )}
      {touched && problem && (
        <p role="alert" className="adm-error">
          {problem}
        </p>
      )}
      <button type="submit" className="btn pri" disabled={busy}>
        Save points
      </button>
    </form>
  );
}

function SyllabusForm({
  initial,
  label,
  submit,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: Fields;
  label: string;
  submit: string;
  busy: boolean;
  onSubmit: (f: Fields) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const { subjects } = useSubjects();
  const [f, setF] = useState(initial);
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const problem = !f.code.trim() ? 'Add a code, like 9618.' : !f.title.trim() ? 'Add a title.' : null;

  async function save(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (problem) return;
    if ((await onSubmit(f)) && !onCancel) {
      setF(EMPTY);
      setTouched(false);
    }
  }

  return (
    <form className="adm-form" onSubmit={save} aria-label={label} noValidate>
      <div className="adm-row">
        <label>
          Code (shown on lesson tags, e.g. 9618)
          <input value={f.code} maxLength={20} onChange={(e) => set('code', e.target.value)} />
        </label>
        <label>
          Subject (its colour)
          <select value={f.subject_id ?? ''} onChange={(e) => set('subject_id', e.target.value || null)}>
            <option value="">None</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Title (e.g. Cambridge AS &amp; A Level Computer Science 9618)
        <input value={f.title} maxLength={120} onChange={(e) => set('title', e.target.value)} />
      </label>
      <label>
        Short description (optional, e.g. the syllabus years)
        <textarea rows={2} maxLength={500} value={f.description} onChange={(e) => set('description', e.target.value)} />
      </label>
      {touched && problem && (
        <p role="alert" className="adm-error">
          {problem}
        </p>
      )}
      <div className="adm-quick">
        <button type="submit" className="btn pri" disabled={busy}>
          {submit}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
