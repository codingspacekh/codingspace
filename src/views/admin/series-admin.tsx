import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { api } from '@/lib/admin-api';
import { moveItem } from '@/lib/post-rules';
import { useSubjects } from '@/lib/subjects';
import type { AdminSeries, SeriesLessonChoice } from '@/server/admin/series';

type Reply = { error?: string; failed?: string[] };
type Fields = { title: string; description: string; post_ids: string[] };

const EMPTY: Fields = { title: '', description: '', post_ids: [] };

/**
 * v1.1 (FR-03): lesson series across subjects — add, edit, order and delete series, and pick
 * their lessons from any subject in the order students should take them. Drafts can be added;
 * they appear in the series once published.
 */
export function SeriesAdmin() {
  const [series, setSeries] = useState<AdminSeries[] | null>(null);
  const [lessons, setLessons] = useState<SeriesLessonChoice[]>([]);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { status, data } = await api<{ series?: AdminSeries[]; lessons?: SeriesLessonChoice[] }>('/api/admin/series');
    setFailed(status !== 200);
    if (status === 200) {
      setSeries(data.series ?? []);
      setLessons(data.lessons ?? []);
    }
  }, []);

  useEffect(() => {
    // Loading the series is the point of this effect.
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
    if (!series) return;
    const next = moveItem(series, index, delta);
    setSeries(next);
    void change(
      () => api('/api/admin/series/order', { method: 'PUT', body: { ids: next.map((s) => s.id) } }),
      `Moved “${series[index]!.title}” ${delta < 0 ? 'up' : 'down'}.`,
    );
  }

  return (
    <>
      <h1>Series</h1>
      <p className="adm-lead">
        A series is a list of lessons from any subject, in the order to take them (a course, an exam paper, the maths a
        physics topic needs). Each lesson in it shows “Part n of N” with links to the lessons before and after.
      </p>
      <p className="adm-live" role="status">
        {message}
      </p>
      {failed ? (
        <p role="alert" className="adm-error">
          The series could not be loaded. Reload the page to try again.
        </p>
      ) : !series ? (
        <p aria-live="polite">Loading…</p>
      ) : (
        <>
          {series.length === 0 ? (
            <p className="empty">No series yet. Add the first one below.</p>
          ) : (
            <ol className="adm-sections" aria-label="Series, in order">
              {series.map((s, i) => (
                <SeriesCard
                  key={s.id}
                  series={s}
                  lessons={lessons}
                  first={i === 0}
                  last={i === series.length - 1}
                  busy={busy}
                  onMove={(d) => move(i, d)}
                  onSave={(f) =>
                    change(() => api(`/api/admin/series/${s.id}`, { method: 'PUT', body: f }), `Saved “${f.title}”.`)
                  }
                  onDelete={() =>
                    change(() => api(`/api/admin/series/${s.id}`, { method: 'DELETE' }), `Deleted “${s.title}”.`)
                  }
                />
              ))}
            </ol>
          )}
          <section className="frame adm-section" aria-labelledby="add-series">
            <h2 id="add-series">Add a series</h2>
            <SeriesForm
              initial={EMPTY}
              lessons={lessons}
              label="Add a series"
              submit="Add series"
              busy={busy}
              onSubmit={(f) =>
                change(() => api('/api/admin/series', { method: 'POST', body: f }), `Added “${f.title}” at the end.`)
              }
            />
          </section>
        </>
      )}
    </>
  );
}

function SeriesCard({
  series: s,
  lessons,
  first,
  last,
  busy,
  onMove,
  onSave,
  onDelete,
}: {
  series: AdminSeries;
  lessons: SeriesLessonChoice[];
  first: boolean;
  last: boolean;
  busy: boolean;
  onMove: (delta: -1 | 1) => void;
  onSave: (f: Fields) => Promise<boolean>;
  onDelete: () => void;
}) {
  const { subject: subjectOf } = useSubjects();
  const subjectName = (s: string | null) => (s ? (subjectOf(s)?.name ?? s) : 'No subject');
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const picked = s.post_ids.flatMap((pid) => byId.get(pid) ?? []);
  const live = picked.filter((l) => l.status === 'published').length;

  return (
    <li className="frame adm-section" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`}>{s.title}</h2>
      {editing ? (
        <SeriesForm
          initial={{ title: s.title, description: s.description, post_ids: s.post_ids }}
          lessons={lessons}
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
            {picked.length} lesson{picked.length === 1 ? '' : 's'}
            {live < picked.length && ` (${live} live)`}
            {picked.length > 0 && ` · ${[...new Set(picked.map((l) => subjectName(l.subject_id)))].join(', ')}`}
            {live > 0 && (
              <>
                {' · '}
                <a href={`/series/${s.slug}`} target="_blank" rel="noopener">
                  /series/{s.slug}
                </a>
              </>
            )}
          </p>
          {live === 0 && <p className="adm-hint">Visitors see this series once one of its lessons is live.</p>}
          {picked.length > 0 && (
            <ol className="adm-series-lessons">
              {picked.map((l) => (
                <li key={l.id}>
                  {l.title || 'Untitled'} <span className="meta">{subjectName(l.subject_id)}</span>
                  {l.status !== 'published' && <span className="adm-status">{l.status}</span>}
                </li>
              ))}
            </ol>
          )}
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
                Delete the series “{s.title}”? Its lessons stay.
                <button type="button" className="btn adm-danger" disabled={busy} onClick={onDelete}>
                  Delete series
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
        </>
      )}
    </li>
  );
}

function SeriesForm({
  initial,
  lessons,
  label,
  submit,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: Fields;
  lessons: SeriesLessonChoice[];
  label: string;
  submit: string;
  busy: boolean;
  onSubmit: (f: Fields) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const { subjects: allSubjects, subject: subjectOf } = useSubjects();
  const subjectName = (s: string | null) => (s ? (subjectOf(s)?.name ?? s) : 'No subject');
  const id = useId();
  const [f, setF] = useState(initial);
  const [adding, setAdding] = useState('');
  const [touched, setTouched] = useState(false);
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const picked = f.post_ids.flatMap((pid) => byId.get(pid) ?? []);
  const free = lessons.filter((l) => !f.post_ids.includes(l.id));
  const problem = !f.title.trim() ? 'Add a title.' : null;
  const setIds = (post_ids: string[]) => setF((prev) => ({ ...prev, post_ids }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (problem) return;
    if ((await onSubmit(f)) && !onCancel) setF(EMPTY);
  }

  function add() {
    if (!adding) return;
    setIds([...f.post_ids, adding]);
    setAdding('');
  }

  return (
    <form className="adm-form" onSubmit={save} aria-label={label} noValidate>
      <label>
        Title
        <input
          value={f.title}
          maxLength={120}
          required
          onChange={(e) => setF((prev) => ({ ...prev, title: e.target.value }))}
        />
      </label>
      <label>
        Short description (optional)
        <textarea
          rows={2}
          maxLength={500}
          value={f.description}
          onChange={(e) => setF((prev) => ({ ...prev, description: e.target.value }))}
        />
      </label>
      <fieldset className="adm-fieldset">
        <legend>Lessons, in order</legend>
        {picked.length === 0 ? (
          <p className="adm-hint">No lessons yet. Add them below, from any subject.</p>
        ) : (
          <ol className="adm-series-pick" aria-label="Lessons in this series">
            {picked.map((l, i) => {
              const name = l.title || 'Untitled';
              return (
                <li key={l.id}>
                  <span>
                    {name} <span className="meta">{subjectName(l.subject_id)}</span>
                    {l.status !== 'published' && <span className="adm-status">{l.status}</span>}
                  </span>
                  <span className="adm-quick">
                    <button
                      type="button"
                      className="btn"
                      disabled={i === 0}
                      aria-label={`Move ${name} up`}
                      onClick={() => setIds(moveItem(f.post_ids, i, -1))}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={i === picked.length - 1}
                      aria-label={`Move ${name} down`}
                      onClick={() => setIds(moveItem(f.post_ids, i, 1))}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn"
                      aria-label={`Remove ${name}`}
                      onClick={() => setIds(f.post_ids.filter((x) => x !== l.id))}
                    >
                      Remove
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        <div className="adm-filters">
          <label htmlFor={`${id}-add`}>
            Add a lesson
            <select id={`${id}-add`} value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">Choose a lesson…</option>
              {[...allSubjects.map((s) => s.id), null].map((subject) => {
                const group = free.filter((l) => l.subject_id === subject);
                return (
                  group.length > 0 && (
                    <optgroup key={subject ?? 'none'} label={subjectName(subject)}>
                      {group.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.title || 'Untitled'}
                          {l.status !== 'published' ? ` (${l.status})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )
                );
              })}
            </select>
          </label>
          <button type="button" className="btn" disabled={!adding} onClick={add}>
            Add to the series
          </button>
        </div>
      </fieldset>
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
