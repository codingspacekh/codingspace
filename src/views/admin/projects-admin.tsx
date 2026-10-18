import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { api } from '@/lib/admin-api';
import { moveItem } from '@/lib/post-rules';
import { landingUrlProblem } from '@/lib/site-rules';
import { useSubjects, type SubjectId } from '@/lib/subjects';
import type { AdminProject } from '@/server/admin/site';

type Reply = { error?: string; failed?: string[] };
type Fields = {
  name: string;
  description: string;
  landing_url: string;
  subject_id: SubjectId | null;
  tag: string;
  glyph: string;
  platforms: string;
};

const EMPTY: Fields = {
  name: '',
  description: '',
  landing_url: 'https://',
  subject_id: null,
  tag: '',
  glyph: '',
  platforms: '',
};

const toFields = (p: AdminProject): Fields => ({
  name: p.name,
  description: p.description,
  landing_url: p.landing_url,
  subject_id: p.subject_id,
  tag: p.tag,
  glyph: p.glyph,
  platforms: p.platforms.join(', '),
});

const toBody = (f: Fields) => ({
  ...f,
  platforms: f.platforms
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
});

/**
 * 03 ADM-13: the projects on the Projects page and Home — add, edit, order, delete, and
 * the one featured project (shown first, and on Home). Each links to its own landing page.
 */
export function ProjectsAdmin() {
  const [projects, setProjects] = useState<AdminProject[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { status, data } = await api<{ projects?: AdminProject[] }>('/api/admin/projects');
    setFailed(status !== 200);
    if (status === 200) setProjects(data.projects ?? []);
  }, []);

  useEffect(() => {
    // Loading the projects is the point of this effect.
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
    if (!projects) return;
    const next = moveItem(projects, index, delta);
    setProjects(next);
    void change(
      () => api('/api/admin/projects/order', { method: 'PUT', body: { ids: next.map((p) => p.id) } }),
      `Moved “${projects[index]!.name}” ${delta < 0 ? 'up' : 'down'}.`,
    );
  }

  return (
    <>
      <h1>Projects</h1>
      <p className="adm-lead">
        Shown on the Projects page in this order. The featured one goes first there, and on Home with the next one.
      </p>
      <p className="adm-live" role="status">
        {message}
      </p>
      {failed ? (
        <p role="alert" className="adm-error">
          The projects could not be loaded. Reload the page to try again.
        </p>
      ) : !projects ? (
        <p aria-live="polite">Loading…</p>
      ) : (
        <>
          {projects.length === 0 ? (
            <p className="empty">No projects yet. Add the first one below.</p>
          ) : (
            <ol className="adm-sections" aria-label="Projects, in order">
              {projects.map((p, i) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  first={i === 0}
                  last={i === projects.length - 1}
                  busy={busy}
                  onMove={(d) => move(i, d)}
                  onFeature={(on) =>
                    change(
                      () => api('/api/admin/projects/featured', { method: 'PUT', body: { id: on ? p.id : null } }),
                      on ? `“${p.name}” is now the featured project.` : 'No project is featured now.',
                    )
                  }
                  onSave={(f) =>
                    change(
                      () => api(`/api/admin/projects/${p.id}`, { method: 'PUT', body: toBody(f) }),
                      `Saved “${f.name}”.`,
                    )
                  }
                  onDelete={() =>
                    change(() => api(`/api/admin/projects/${p.id}`, { method: 'DELETE' }), `Deleted “${p.name}”.`)
                  }
                />
              ))}
            </ol>
          )}
          <section className="frame adm-section" aria-labelledby="add-project">
            <h2 id="add-project">Add a project</h2>
            <ProjectForm
              initial={EMPTY}
              label="Add a project"
              submit="Add project"
              busy={busy}
              onSubmit={(f) =>
                change(
                  () => api('/api/admin/projects', { method: 'POST', body: toBody(f) }),
                  `Added “${f.name}” at the end.`,
                )
              }
            />
          </section>
        </>
      )}
    </>
  );
}

function ProjectCard({
  project: p,
  first,
  last,
  busy,
  onMove,
  onFeature,
  onSave,
  onDelete,
}: {
  project: AdminProject;
  first: boolean;
  last: boolean;
  busy: boolean;
  onMove: (delta: -1 | 1) => void;
  onFeature: (on: boolean) => void;
  onSave: (f: Fields) => Promise<boolean>;
  onDelete: () => void;
}) {
  const { subject: subjectOf } = useSubjects();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="frame adm-section" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`}>
        {p.glyph && <span aria-hidden="true">{p.glyph} </span>}
        {p.name}
        {p.is_featured && <span className="adm-status adm-status--published">Featured</span>}
      </h2>
      {editing ? (
        <ProjectForm
          initial={toFields(p)}
          label={`Edit ${p.name}`}
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
          <p>{p.description}</p>
          <p className="meta">
            {[subjectOf(p.subject_id)?.name, p.tag, p.platforms.join(', ')].filter(Boolean).join(' · ')}
          </p>
          <p className="meta">
            <a href={p.landing_url} target="_blank" rel="noopener noreferrer">
              {p.landing_url}
            </a>
          </p>
          <div className="adm-quick">
            <button
              type="button"
              className="btn"
              disabled={busy || first}
              onClick={() => onMove(-1)}
              aria-label={`Move ${p.name} up`}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || last}
              onClick={() => onMove(1)}
              aria-label={`Move ${p.name} down`}
            >
              ↓
            </button>
            <button type="button" className="btn" onClick={() => setEditing(true)} aria-label={`Edit ${p.name}`}>
              Edit
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              aria-pressed={p.is_featured}
              aria-label={`Feature ${p.name}`}
              onClick={() => onFeature(!p.is_featured)}
            >
              {p.is_featured ? '★ Featured' : '☆ Feature'}
            </button>
            {confirming ? (
              <span className="adm-confirm" role="group" aria-label="Confirm delete">
                Delete “{p.name}” for good?
                <button type="button" className="btn adm-danger" disabled={busy} onClick={onDelete}>
                  Delete permanently
                </button>
                <button type="button" className="btn" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" className="btn" onClick={() => setConfirming(true)} aria-label={`Delete ${p.name}`}>
                Delete…
              </button>
            )}
          </div>
        </>
      )}
    </li>
  );
}

function ProjectForm({
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
  const { subjects: allSubjects, subject: subjectOf } = useSubjects();
  const id = useId();
  const [f, setF] = useState(initial);
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const urlProblem = landingUrlProblem(f.landing_url);
  const problem = !f.name.trim() ? 'Add a name.' : !f.description.trim() ? 'Add a short description.' : urlProblem;

  async function save(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (problem) return;
    if ((await onSubmit(f)) && !onCancel) setF(EMPTY);
  }

  return (
    <form className="adm-form" onSubmit={save} aria-label={label} noValidate>
      <label>
        Name
        <input value={f.name} maxLength={80} required onChange={(e) => set('name', e.target.value)} />
      </label>
      <label>
        Short description
        <textarea
          rows={2}
          maxLength={500}
          required
          value={f.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </label>
      <label>
        Landing page
        <input
          type="url"
          inputMode="url"
          value={f.landing_url}
          maxLength={500}
          required
          aria-invalid={touched && !!urlProblem}
          aria-describedby={`${id}-url`}
          onChange={(e) => set('landing_url', e.target.value)}
          onBlur={() => setTouched(true)}
        />
      </label>
      <p id={`${id}-url`} className={touched && urlProblem ? 'adm-error' : 'adm-hint'}>
        {touched && urlProblem
          ? urlProblem
          : 'The project’s own page (https:// only). Students go there to use or download it.'}
      </p>
      <label>
        Subject
        <select
          value={f.subject_id ?? ''}
          onChange={(e) => set('subject_id', (e.target.value || null) as SubjectId | null)}
        >
          <option value="">None</option>
          {allSubjects.map(({ id: s }) => (
            <option key={s} value={s}>
              {subjectOf(s)?.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Tag (e.g. Web app, Simulation)
        <input value={f.tag} maxLength={40} onChange={(e) => set('tag', e.target.value)} />
      </label>
      <label>
        Platforms, separated by commas (e.g. Web, Android)
        <input value={f.platforms} maxLength={250} onChange={(e) => set('platforms', e.target.value)} />
      </label>
      <label>
        Icon: up to 4 characters or an emoji
        <input value={f.glyph} maxLength={4} onChange={(e) => set('glyph', e.target.value)} />
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
