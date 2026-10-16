import Head from 'next/head';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { api } from '@/lib/admin-api';
import { formatDate } from '@/lib/format';
import { mondayOf } from '@/lib/site-rules';
import { SUBJECT_IDS, SUBJECTS, type SubjectId } from '@/lib/subjects';
import type { AdminProblem } from '@/server/admin/site';

type Reply = { error?: string; failed?: string[]; id?: string };
type Fields = {
  subject_id: SubjectId;
  section_id: string | null;
  week_of: string;
  statement: string;
  hint: string;
  solution: string;
};
type Section = { id: string; title: string };
type Preview = { statement: string; hint: string; solution: string };

const blank = (): Fields => ({
  subject_id: 'math',
  section_id: null,
  week_of: mondayOf(new Date()),
  statement: '',
  hint: '',
  solution: '',
});

const firstLine = (md: string) =>
  md
    .split('\n')
    .find((l) => l.trim())
    ?.slice(0, 140) ?? '';

/**
 * 03 ADM-11: problems of the week. Each subject shows one current problem (on Home and on its
 * subject page); older ones stay here, hidden, and can be shown again.
 */
export function ProblemsAdmin({ previewDelay = 400 }: { previewDelay?: number }) {
  const [problems, setProblems] = useState<AdminProblem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<AdminProblem | 'new' | null>(null);

  const load = useCallback(async () => {
    const { status, data } = await api<{ problems?: AdminProblem[] }>('/api/admin/problems');
    setFailed(status !== 200);
    if (status === 200) setProblems(data.problems ?? []);
  }, []);

  useEffect(() => {
    // Loading the problems is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

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
    return { ok, data };
  }

  return (
    <>
      <Head>
        <link rel="stylesheet" href="/katex/katex.min.css" />
      </Head>
      <div className="adm-head">
        <h1>Problem of the week</h1>
        {!editing && (
          <button type="button" className="btn pri" onClick={() => setEditing('new')}>
            New problem
          </button>
        )}
      </div>
      <p className="adm-lead">
        Each subject shows one problem: on Home (the newest) and on the subject’s page. Hints and solutions stay hidden
        until a student asks.
      </p>
      <p className="adm-live" role="status">
        {message}
      </p>

      {editing && (
        <ProblemForm
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? blank() : editing}
          isNew={editing === 'new'}
          busy={busy}
          previewDelay={previewDelay}
          onCancel={() => setEditing(null)}
          onSubmit={async (f, show) => {
            const isNew = editing === 'new';
            const { ok, data } = await change(
              () =>
                isNew
                  ? api<Reply>('/api/admin/problems', { method: 'POST', body: f })
                  : api<Reply>(`/api/admin/problems/${editing.id}`, { method: 'PUT', body: f }),
              isNew ? 'Added.' : 'Saved.',
            );
            if (ok && isNew && show && data.id) {
              await change(
                () => api(`/api/admin/problems/${data.id}`, { method: 'PATCH', body: { current: true } }),
                `Added, and showing it as the ${SUBJECTS[f.subject_id].name} problem of the week.`,
              );
            }
            if (ok) setEditing(null);
          }}
        />
      )}

      {failed ? (
        <p role="alert" className="adm-error">
          The problems could not be loaded. Reload the page to try again.
        </p>
      ) : !problems ? (
        <p aria-live="polite">Loading…</p>
      ) : problems.length === 0 ? (
        <p className="empty">No problems yet.</p>
      ) : (
        <ul className="adm-sections" aria-label="Problems, newest week first">
          {problems.map((p) => (
            <ProblemCard
              key={p.id}
              problem={p}
              busy={busy}
              onEdit={() => setEditing(p)}
              onShow={(on) =>
                change(
                  () => api(`/api/admin/problems/${p.id}`, { method: 'PATCH', body: { current: on } }),
                  on
                    ? `Showing it as the ${SUBJECTS[p.subject_id].name} problem of the week.`
                    : 'It is no longer shown on the site.',
                )
              }
              onDelete={() => change(() => api(`/api/admin/problems/${p.id}`, { method: 'DELETE' }), 'Deleted.')}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function ProblemCard({
  problem: p,
  busy,
  onEdit,
  onShow,
  onDelete,
}: {
  problem: AdminProblem;
  busy: boolean;
  onEdit: () => void;
  onShow: (on: boolean) => void;
  onDelete: () => void;
}) {
  const id = useId();
  const [confirming, setConfirming] = useState(false);
  const title = `${SUBJECTS[p.subject_id].name}, week of ${formatDate(p.week_of)}`;
  return (
    <li className="frame adm-section" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`}>
        {title}{' '}
        {p.is_current ? (
          <span className="adm-status adm-status--published">Showing</span>
        ) : (
          <span className="adm-status">Hidden</span>
        )}
      </h2>
      <p className="adm-problem-line">{firstLine(p.statement)}</p>
      <div className="adm-quick">
        <button type="button" className="btn" onClick={onEdit} aria-label={`Edit ${title}`}>
          Edit
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          aria-label={p.is_current ? `Stop showing ${title}` : `Show ${title} on the site`}
          onClick={() => onShow(!p.is_current)}
        >
          {p.is_current ? 'Stop showing' : 'Show on the site'}
        </button>
        {confirming ? (
          <span className="adm-confirm" role="group" aria-label="Confirm delete">
            Delete this problem for good?
            <button type="button" className="btn adm-danger" disabled={busy} onClick={onDelete}>
              Delete permanently
            </button>
            <button type="button" className="btn" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" className="btn" onClick={() => setConfirming(true)} aria-label={`Delete ${title}`}>
            Delete…
          </button>
        )}
      </div>
    </li>
  );
}

function ProblemForm({
  initial,
  isNew,
  busy,
  previewDelay,
  onSubmit,
  onCancel,
}: {
  initial: Fields;
  isNew: boolean;
  busy: boolean;
  previewDelay: number;
  onSubmit: (f: Fields, show: boolean) => Promise<void>;
  onCancel: () => void;
}) {
  const [f, setF] = useState<Fields>({
    subject_id: initial.subject_id,
    section_id: initial.section_id,
    week_of: initial.week_of,
    statement: initial.statement,
    hint: initial.hint,
    solution: initial.solution,
  });
  const [show, setShow] = useState(true);
  const [touched, setTouched] = useState(false);
  const [sections, setSections] = useState<Section[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const problem = !f.statement.trim() ? 'Write the problem.' : !f.week_of ? 'Choose the week.' : null;

  // The subject's sections, for the optional topic.
  useEffect(() => {
    void api<{ sections?: Section[] }>(`/api/admin/sections?subject=${f.subject_id}`).then(({ status, data }) => {
      if (status === 200) setSections(data.sections ?? []);
    });
  }, [f.subject_id]);

  // Live preview (03 ADM-11): rendered by the server exactly as students will see it.
  const latest = useRef(0);
  useEffect(() => {
    const ticket = ++latest.current;
    const timer = setTimeout(async () => {
      const { status, data } = await api<Preview>('/api/admin/problems/preview', {
        method: 'POST',
        body: { statement: f.statement, hint: f.hint, solution: f.solution },
      });
      if (status === 200 && ticket === latest.current) setPreview(data);
    }, previewDelay);
    return () => clearTimeout(timer);
  }, [f.statement, f.hint, f.solution, previewDelay]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (problem) return;
    await onSubmit(f, isNew && show);
  }

  return (
    <div className="ed-layout adm-problem-edit">
      <form
        className="adm-form frame adm-section"
        onSubmit={save}
        aria-label={isNew ? 'New problem' : 'Edit problem'}
        noValidate
      >
        <h2>{isNew ? 'New problem' : 'Edit problem'}</h2>
        <div className="adm-row">
          <label>
            Subject
            <select
              value={f.subject_id}
              onChange={(e) => setF((prev) => ({ ...prev, subject_id: e.target.value as SubjectId, section_id: null }))}
            >
              {SUBJECT_IDS.map((s) => (
                <option key={s} value={s}>
                  {SUBJECTS[s].name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Topic (section, optional)
            <select value={f.section_id ?? ''} onChange={(e) => set('section_id', e.target.value || null)}>
              <option value="">None</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Week of
            <input type="date" value={f.week_of} required onChange={(e) => set('week_of', e.target.value)} />
          </label>
        </div>
        <label>
          Problem
          <textarea
            rows={5}
            maxLength={4000}
            required
            value={f.statement}
            spellCheck={false}
            onChange={(e) => set('statement', e.target.value)}
          />
        </label>
        <p className="adm-hint">Markdown, with $…$ for maths in a sentence and $$…$$ for a displayed formula.</p>
        <label>
          Hint (optional)
          <textarea rows={2} maxLength={4000} value={f.hint} onChange={(e) => set('hint', e.target.value)} />
        </label>
        <label>
          Solution (optional)
          <textarea rows={5} maxLength={4000} value={f.solution} onChange={(e) => set('solution', e.target.value)} />
        </label>
        {isNew && (
          <label className="adm-inline">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
            Show it on the site now (instead of the current {SUBJECTS[f.subject_id].name} problem)
          </label>
        )}
        {touched && problem && (
          <p role="alert" className="adm-error">
            {problem}
          </p>
        )}
        <div className="adm-quick">
          <button type="submit" className="btn pri" disabled={busy}>
            {isNew ? 'Add problem' : 'Save'}
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>

      <section className="frame adm-section" aria-label="Preview" aria-live="polite">
        <h2>Preview</h2>
        {!preview || !preview.statement ? (
          <p className="meta">The problem appears here as students will see it.</p>
        ) : (
          <>
            <div className="prose" dangerouslySetInnerHTML={{ __html: preview.statement }} />
            {preview.hint && (
              <details className="reveal">
                <summary>Show a hint</summary>
                <div className="prose" dangerouslySetInnerHTML={{ __html: preview.hint }} />
              </details>
            )}
            {preview.solution && (
              <details className="reveal">
                <summary>Show the solution</summary>
                <div className="prose" dangerouslySetInnerHTML={{ __html: preview.solution }} />
              </details>
            )}
          </>
        )}
      </section>
    </div>
  );
}
