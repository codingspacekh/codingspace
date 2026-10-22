import Link from 'next/link';
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { api } from '@/lib/admin-api';
import { moveItem } from '@/lib/post-rules';
import { SUBJECT_ICON_NAMES, SUBJECT_ICONS } from '@/lib/subject-icons';
import { SUBJECT_COLORS, SUBJECT_ID, subjectAddress, type SubjectColor } from '@/lib/subjects';
import { SubjectMark } from '@/ui/subject-mark';
import type { AdminSubject } from '@/server/admin/subjects';

type Reply = { error?: string; failed?: string[] };
type Fields = {
  id: string;
  name: string;
  glyph: string;
  icon: string;
  color: SubjectColor;
  blurb: string;
  intro: string;
  visible: boolean;
};

const EMPTY: Fields = { id: '', name: '', glyph: '', icon: '', color: 'cyan', blurb: '', intro: '', visible: false };
const COLOR_NAMES: Record<SubjectColor, string> = {
  cyan: 'Cyan',
  violet: 'Violet',
  amber: 'Amber',
  lime: 'Lime',
  pink: 'Pink',
  orange: 'Orange',
  sky: 'Sky blue',
  rose: 'Rose',
  gold: 'Gold',
};
const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/**
 * v1.1: the subjects in Study (owner request, 2026-10-18): add, edit, show or hide, reorder and
 * delete them. A new subject starts hidden, so its sections and lessons can be built first.
 */
export function SubjectsAdmin() {
  const [subjects, setSubjects] = useState<AdminSubject[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { status, data } = await api<{ subjects?: AdminSubject[] }>('/api/admin/subjects');
    setFailed(status !== 200);
    if (status === 200) setSubjects(data.subjects ?? []);
  }, []);

  useEffect(() => {
    // Loading the subjects is the point of this effect.
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
    if (!subjects) return;
    const next = moveItem(subjects, index, delta);
    setSubjects(next);
    void change(
      () => api('/api/admin/subjects/order', { method: 'PUT', body: { ids: next.map((s) => s.id) } }),
      `Moved “${subjects[index]!.name}” ${delta < 0 ? 'up' : 'down'}.`,
    );
  }

  return (
    <>
      <h1>Subjects</h1>
      <p className="adm-lead">
        The subjects in Study, in the order the menus, Home and the orbit show them. Add their sections and lessons in{' '}
        <Link href="/admin/sections">Study structure</Link>.
      </p>
      <p className="adm-live" role="status">
        {message}
      </p>
      {failed ? (
        <p role="alert" className="adm-error">
          The subjects could not be loaded. Reload the page to try again.
        </p>
      ) : !subjects ? (
        <p aria-live="polite">Loading…</p>
      ) : (
        <>
          <ol className="adm-sections" aria-label="Subjects, in order">
            {subjects.map((s, i) => (
              <SubjectCard
                key={s.id}
                subject={s}
                first={i === 0}
                last={i === subjects.length - 1}
                only={subjects.length === 1}
                busy={busy}
                onMove={(d) => move(i, d)}
                onSave={(f) =>
                  change(() => api(`/api/admin/subjects/${s.id}`, { method: 'PUT', body: f }), `Saved “${f.name}”.`)
                }
                onDelete={() =>
                  change(() => api(`/api/admin/subjects/${s.id}`, { method: 'DELETE' }), `Deleted “${s.name}”.`)
                }
              />
            ))}
          </ol>
          <section className="frame adm-section" aria-labelledby="add-subject">
            <h2 id="add-subject">Add a subject</h2>
            <SubjectForm
              initial={EMPTY}
              isNew
              taken={subjects.map((s) => s.id)}
              label="Add a subject"
              submit="Add subject"
              busy={busy}
              onSubmit={(f) =>
                change(
                  () => api('/api/admin/subjects', { method: 'POST', body: f }),
                  f.visible
                    ? `Added “${f.name}” at the end.`
                    : `Added “${f.name}” at the end, hidden. Show it once it has lessons.`,
                )
              }
            />
          </section>
        </>
      )}
    </>
  );
}

function SubjectCard({
  subject: s,
  first,
  last,
  only,
  busy,
  onMove,
  onSave,
  onDelete,
}: {
  subject: AdminSubject;
  first: boolean;
  last: boolean;
  only: boolean;
  busy: boolean;
  onMove: (delta: -1 | 1) => void;
  onSave: (f: Fields) => Promise<boolean>;
  onDelete: () => void;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const empty = s.sections === 0 && s.lessons === 0;

  return (
    <li className={`frame adm-section c-${s.color}`} aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`}>
        <span className="adm-glyph" aria-hidden="true">
          <SubjectMark subject={s} />
        </span>{' '}
        {s.name} {!s.visible && <span className="adm-status">Hidden</span>}
      </h2>
      {editing ? (
        <SubjectForm
          initial={{
            id: s.id,
            name: s.name,
            glyph: s.glyph,
            icon: s.icon,
            color: s.color,
            blurb: s.blurb,
            intro: s.intro,
            visible: s.visible,
          }}
          label={`Edit ${s.name}`}
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
          {s.blurb && <p>{s.blurb}</p>}
          <p className="meta">
            {count(s.sections, 'section')} · {count(s.lessons, 'lesson')} ·{' '}
            {s.visible ? (
              <a href={`/study/${s.id}`} target="_blank" rel="noopener">
                /study/{s.id}
              </a>
            ) : (
              `/study/${s.id} (hidden from visitors)`
            )}
          </p>
          <div className="adm-quick">
            <button
              type="button"
              className="btn"
              disabled={busy || first}
              onClick={() => onMove(-1)}
              aria-label={`Move ${s.name} up`}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || last}
              onClick={() => onMove(1)}
              aria-label={`Move ${s.name} down`}
            >
              ↓
            </button>
            <button type="button" className="btn" onClick={() => setEditing(true)} aria-label={`Edit ${s.name}`}>
              Edit
            </button>
            <Link className="btn" href={{ pathname: '/admin/sections', query: { subject: s.id } }}>
              Sections
            </Link>
            {confirming ? (
              <span className="adm-confirm" role="group" aria-label="Confirm delete">
                Delete the subject “{s.name}”?
                <button type="button" className="btn adm-danger" disabled={busy} onClick={onDelete}>
                  Delete subject
                </button>
                <button type="button" className="btn" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="btn"
                disabled={!empty || only}
                onClick={() => setConfirming(true)}
                aria-label={`Delete ${s.name}`}
              >
                Delete…
              </button>
            )}
          </div>
          {!empty && <p className="adm-hint">To delete this subject, first delete or move its sections and lessons.</p>}
        </>
      )}
    </li>
  );
}

function SubjectForm({
  initial,
  isNew = false,
  taken = [],
  label,
  submit,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: Fields;
  isNew?: boolean;
  /** Addresses already in use (new subjects only). */
  taken?: string[];
  label: string;
  submit: string;
  busy: boolean;
  onSubmit: (f: Fields) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const id = useId();
  const [f, setF] = useState(initial);
  // The address follows the name until the owner types one.
  const [ownAddress, setOwnAddress] = useState(false);
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const problem = !f.name.trim()
    ? 'Add a name.'
    : isNew && !SUBJECT_ID.test(f.id)
      ? 'Add an address: lowercase letters only (a-z), no spaces.'
      : isNew && taken.includes(f.id)
        ? `There is already a subject at /study/${f.id}.`
        : null;

  async function save(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (problem) return;
    if ((await onSubmit(f)) && !onCancel) {
      setF(EMPTY);
      setOwnAddress(false);
      setTouched(false);
    }
  }

  return (
    <form className="adm-form" onSubmit={save} aria-label={label} noValidate>
      <label>
        Name
        <input
          value={f.name}
          maxLength={40}
          required
          onChange={(e) => {
            const name = e.target.value;
            setF((prev) => ({ ...prev, name, id: isNew && !ownAddress ? subjectAddress(name) : prev.id }));
          }}
        />
      </label>
      {isNew && (
        <label>
          Address
          <span className="adm-prefix">
            /study/
            <input
              value={f.id}
              maxLength={24}
              aria-describedby={`${id}-addr`}
              onChange={(e) => {
                setOwnAddress(true);
                set('id', e.target.value.toLowerCase().replace(/[^a-z]/g, ''));
              }}
            />
          </span>
          <span id={`${id}-addr`} className="adm-hint">
            Lowercase letters only. It can’t be changed later: links to the subject use it.
          </span>
        </label>
      )}
      <div className="adm-row">
        <label>
          Symbol
          <input
            value={f.glyph}
            maxLength={4}
            aria-describedby={`${id}-glyph`}
            onChange={(e) => set('glyph', e.target.value)}
          />
          <span id={`${id}-glyph`} className="adm-hint">
            Up to 4 characters, like ∑, Ψ or ⚗.
          </span>
        </label>
        <label>
          Colour
          <select value={f.color} onChange={(e) => set('color', e.target.value as SubjectColor)}>
            {SUBJECT_COLORS.map((c) => (
              <option key={c} value={c}>
                {COLOR_NAMES[c]}
              </option>
            ))}
          </select>
        </label>
        <span className={`adm-swatch c-${f.color}`} aria-hidden="true">
          <SubjectMark subject={{ glyph: f.glyph || '◆', icon: f.icon }} />
        </span>
      </div>
      <fieldset className={`adm-icon-pick c-${f.color}`}>
        <legend>On the site, show</legend>
        <label>
          <input type="radio" name={`${id}-icon`} checked={!f.icon} onChange={() => set('icon', '')} />
          <span className="adm-icon-prev" aria-hidden="true">
            {f.glyph || '◆'}
          </span>
          The symbol
        </label>
        {SUBJECT_ICON_NAMES.map((k) => (
          <label key={k}>
            <input type="radio" name={`${id}-icon`} checked={f.icon === k} onChange={() => set('icon', k)} />
            <span className="adm-icon-prev" aria-hidden="true">
              <SubjectMark subject={{ glyph: '', icon: k }} />
            </span>
            {SUBJECT_ICONS[k].name} icon
          </label>
        ))}
      </fieldset>
      <label>
        One line for the Study menu and Home (optional)
        <input value={f.blurb} maxLength={200} onChange={(e) => set('blurb', e.target.value)} />
      </label>
      <label>
        Introduction at the top of the subject page (optional)
        <textarea rows={3} maxLength={600} value={f.intro} onChange={(e) => set('intro', e.target.value)} />
      </label>
      <label className="adm-inline">
        <input type="checkbox" checked={f.visible} onChange={(e) => set('visible', e.target.checked)} />
        Show it on the site
      </label>
      {isNew && !f.visible && (
        <p className="adm-hint">
          Hidden subjects, and their sections and lessons, stay off the site until you show them.
        </p>
      )}
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
