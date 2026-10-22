import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { api } from '@/lib/admin-api';
import { moveItem } from '@/lib/post-rules';
import { uploadApp as sendApp, uploadMedia } from '@/lib/media-upload';
import { sectionOrder } from '@/lib/project-page';
import { optionalUrlProblem } from '@/lib/site-rules';
import { useSubjects, type SubjectId } from '@/lib/subjects';
import type { AdminProject } from '@/server/admin/site';
import { downloadBody, keptDownloads, toAdminDownload, type AppUpload } from './download-fields';
import {
  EMPTY_PAGE,
  pageProblem,
  parsePoints,
  pointsText,
  ProjectPageFields,
  type PageFields,
  type PagePart,
  type Upload,
} from './project-page-fields';

type Reply = { error?: string; failed?: string[] };
/** The card's fields (Projects and Home); the page's are in PageFields. */
type CardFields = {
  name: string;
  description: string;
  landing_url: string;
  subject_id: SubjectId | null;
  tag: string;
  glyph: string;
  platforms: string;
};
type Fields = CardFields & PageFields;

const EMPTY: CardFields = {
  name: '',
  description: '',
  landing_url: '',
  subject_id: null,
  tag: '',
  glyph: '',
  platforms: '',
};

const toCard = (p: AdminProject): CardFields => ({
  name: p.name,
  description: p.description,
  landing_url: p.landing_url ?? '',
  subject_id: p.subject_id,
  tag: p.tag,
  glyph: p.glyph,
  platforms: p.platforms.join(', '),
});

const toPage = (p: AdminProject): PageFields => ({
  tagline: p.tagline,
  intro: p.intro,
  reasons: p.reasons,
  features: p.features,
  steps: p.steps.map((s) => ({ title: s.title, text: s.text, platform: s.platform ?? '' })),
  faq: p.faq,
  downloads: p.downloads.map(toAdminDownload),
  version: p.version,
  source_url: p.source_url ?? '',
  screenshots: p.screenshots,
  highlights: p.highlights,
  why_title: p.why_title,
  why_text: p.why_text,
  replaces: p.replaces,
  requirements: p.requirements,
  requirements_note: p.requirements_note,
  release_date: p.release_date ?? '',
  release_notes: p.release_notes,
  coming_soon: p.coming_soon,
  section_order: sectionOrder(p.section_order),
  hidden_sections: p.hidden_sections,
  showcase: p.showcase.map(({ points, ...r }) => ({ ...r, points: pointsText(points) })),
});

const toBody = ({ screenshots, downloads, showcase, ...f }: Fields) => ({
  ...f,
  downloads: keptDownloads(downloads).map(downloadBody),
  showcase: showcase.map((r) => ({
    media_id: r.media_id,
    label: r.label,
    title: r.title,
    text: r.text,
    points: parsePoints(r.points),
    color: r.color,
  })),
  platforms: f.platforms
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  screenshots: screenshots.map((s) => ({ media_id: s.media_id, caption: s.caption })),
});

/** One line about the page: what it has, and whether it can be downloaded yet. */
function pageSummary(p: AdminProject): string {
  const parts = [
    p.screenshots.length && `${p.screenshots.length} screenshot${p.screenshots.length === 1 ? '' : 's'}`,
    p.reasons.length && `${p.reasons.length} reason${p.reasons.length === 1 ? '' : 's'}`,
    p.features.length && `${p.features.length} feature${p.features.length === 1 ? '' : 's'}`,
    p.steps.length && `${p.steps.length} step${p.steps.length === 1 ? '' : 's'}`,
    p.faq.length && `${p.faq.length} question${p.faq.length === 1 ? '' : 's'}`,
  ].filter(Boolean);
  const download = p.downloads.length
    ? `${p.downloads.length} download${p.downloads.length === 1 ? '' : 's'}${p.version ? ` (version ${p.version})` : ''}`
    : p.coming_soon
      ? 'Coming soon (no download links yet)'
      : 'No download links';
  return [...parts, download].join(' · ');
}

/**
 * 03 ADM-13: the projects on the Projects page and Home — add, edit, order, delete, and
 * the one featured project (shown first, and on Home). Since v1.1 each card opens the
 * project's own landing page on this site, /projects/<slug>, filled in here.
 * Redesigned 2026-10-20 (from the prototype): the list, and an editor per project with
 * its page's parts on the left and the chosen part on the right.
 */
export function ProjectsAdmin({
  upload = uploadMedia,
  uploadApp = sendApp,
}: {
  upload?: Upload;
  uploadApp?: AppUpload;
}) {
  const [projects, setProjects] = useState<AdminProject[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  /** The project open in the editor: its id, 'new', or none (the list). */
  const [open, setOpen] = useState<string | null>(null);

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

  const status = (
    <p className="adm-live" role="status">
      {message}
    </p>
  );
  const editing = open && open !== 'new' ? projects?.find((p) => p.id === open) : undefined;

  if (open === 'new' || editing)
    return (
      <>
        {status}
        {editing ? (
          <ProjectForm
            key={editing.id}
            project={editing}
            initial={toCard(editing)}
            page={toPage(editing)}
            upload={upload}
            uploadApp={uploadApp}
            label={`Edit ${editing.name}`}
            submit="Save & update"
            busy={busy}
            onSubmit={(f) =>
              change(
                () => api(`/api/admin/projects/${editing.id}`, { method: 'PUT', body: toBody(f) }),
                `Saved “${f.name}”.`,
              )
            }
            onClose={() => setOpen(null)}
          />
        ) : (
          <ProjectForm
            initial={EMPTY}
            page={EMPTY_PAGE}
            upload={upload}
            uploadApp={uploadApp}
            label="Add a project"
            submit="Add project"
            busy={busy}
            onSubmit={async (f) => {
              const ok = await change(
                () => api('/api/admin/projects', { method: 'POST', body: toBody(f) }),
                `Added “${f.name}” at the end.`,
              );
              if (ok) setOpen(null);
              return ok;
            }}
            onClose={() => setOpen(null)}
          />
        )}
      </>
    );

  return (
    <>
      <div className="adm-head">
        <h1>Projects</h1>
        {projects && (
          <button type="button" className="btn pri" onClick={() => setOpen('new')}>
            + New project
          </button>
        )}
      </div>
      <p className="adm-lead">
        Shown on the Projects page in this order. The featured one goes first there, and on Home with the next one.
      </p>
      {status}
      {failed ? (
        <p role="alert" className="adm-error">
          The projects could not be loaded. Reload the page to try again.
        </p>
      ) : !projects ? (
        <p aria-live="polite">Loading…</p>
      ) : projects.length === 0 ? (
        <p className="empty">No projects yet. Add the first one with New project.</p>
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
              onEdit={() => {
                setMessage('');
                setOpen(p.id);
              }}
              onFeature={(on) =>
                change(
                  () => api('/api/admin/projects/featured', { method: 'PUT', body: { id: on ? p.id : null } }),
                  on ? `“${p.name}” is now the featured project.` : 'No project is featured now.',
                )
              }
              onDelete={() =>
                change(() => api(`/api/admin/projects/${p.id}`, { method: 'DELETE' }), `Deleted “${p.name}”.`)
              }
            />
          ))}
        </ol>
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
  onEdit,
  onFeature,
  onDelete,
}: {
  project: AdminProject;
  first: boolean;
  last: boolean;
  busy: boolean;
  onMove: (delta: -1 | 1) => void;
  onEdit: () => void;
  onFeature: (on: boolean) => void;
  onDelete: () => void;
}) {
  const { subject: subjectOf } = useSubjects();
  const id = useId();
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="frame adm-section adm-pj-card" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`}>
        {p.glyph && <span aria-hidden="true">{p.glyph} </span>}
        {p.name}
        {p.is_featured && <span className="adm-status adm-status--published">Featured</span>}
      </h2>
      <p>{p.description}</p>
      <p className="meta">
        {[subjectOf(p.subject_id)?.name, p.tag, p.platforms.join(', ')].filter(Boolean).join(' · ')}
      </p>
      <p className="meta">
        <a href={`/projects/${p.slug}`} target="_blank" rel="noopener">
          /projects/{p.slug}
        </a>
        {p.landing_url && (
          <>
            {' · Website: '}
            <a href={p.landing_url} target="_blank" rel="noopener noreferrer">
              {p.landing_url}
            </a>
          </>
        )}
      </p>
      <p className="meta">{pageSummary(p)}</p>
      <div className="adm-quick">
        <button type="button" className="btn pri" onClick={onEdit} aria-label={`Edit ${p.name}`}>
          Edit
        </button>
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
    </li>
  );
}

/** The editor: a bar with the name and Save, then the page's parts beside the chosen part's panel. */
function ProjectForm({
  project,
  initial,
  page: initialPage,
  upload,
  uploadApp,
  label,
  submit,
  busy,
  onSubmit,
  onClose,
}: {
  /** The project being edited; none for a new one. */
  project?: AdminProject;
  initial: CardFields;
  page: PageFields;
  upload: Upload;
  uploadApp: AppUpload;
  label: string;
  submit: string;
  busy: boolean;
  onSubmit: (f: Fields) => Promise<boolean>;
  onClose: () => void;
}) {
  const { subjects: allSubjects, subject: subjectOf } = useSubjects();
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [f, setF] = useState(initial);
  const [page, setPage] = useState(initialPage);
  const [part, setPart] = useState<PagePart>('card');
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof CardFields>(k: K, v: CardFields[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const urlProblem = optionalUrlProblem(f.landing_url);
  const problem: { part: PagePart; message: string } | null = !f.name.trim()
    ? { part: 'card', message: 'Add a name.' }
    : !f.description.trim()
      ? { part: 'card', message: 'Add a short description.' }
      : urlProblem
        ? { part: 'card', message: `Website: ${urlProblem}` }
        : pageProblem(page);

  // The editor replaces the list: start at its top, for keyboards and screen readers too.
  useEffect(() => heading.current?.focus(), []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (problem) return setPart(problem.part);
    await onSubmit({ ...f, ...page });
  }

  const card = (
    <div className="adm-pj-fields">
      <label>
        Name
        <input value={f.name} maxLength={80} required onChange={(e) => set('name', e.target.value)} />
      </label>
      <label>
        Icon: up to 4 characters or an emoji
        <input value={f.glyph} maxLength={4} onChange={(e) => set('glyph', e.target.value)} />
      </label>
      <label className="adm-pj-wide">
        Short description, for the card on Projects and Home
        <textarea
          rows={2}
          maxLength={500}
          required
          value={f.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </label>
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
      <label className="adm-pj-wide">
        Platforms, separated by commas (e.g. Web, Android)
        <input value={f.platforms} maxLength={250} onChange={(e) => set('platforms', e.target.value)} />
      </label>
      <div className="adm-pj-wide adm-pj-stack">
        <label>
          Website (optional)
          <input
            type="url"
            inputMode="url"
            value={f.landing_url}
            maxLength={500}
            aria-invalid={touched && !!urlProblem}
            aria-describedby={`${id}-url`}
            onChange={(e) => set('landing_url', e.target.value)}
            onBlur={() => setTouched(true)}
          />
        </label>
        <p id={`${id}-url`} className={touched && urlProblem ? 'adm-error' : 'adm-hint'}>
          {touched && urlProblem
            ? urlProblem
            : 'Only if the project also has a site of its own (https://). Its page here links to it.'}
        </p>
      </div>
    </div>
  );

  return (
    <form className="adm-form adm-pj-form" onSubmit={save} aria-label={label} noValidate>
      <div className="adm-pj-top">
        <div className="adm-pj-title">
          <p className="meta">
            <button type="button" className="adm-pj-back" onClick={onClose}>
              ← Projects
            </button>
          </p>
          <h1 ref={heading} tabIndex={-1}>
            {f.glyph && <span aria-hidden="true">{f.glyph} </span>}
            {f.name.trim() || (project ? project.name : 'New project')}
            {project?.is_featured && <span className="adm-status adm-status--published">Featured</span>}
          </h1>
        </div>
        <div className="adm-quick">
          {project && (
            <a className="btn" href={`/projects/${project.slug}`} target="_blank" rel="noopener">
              View page ↗<span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
          <button type="button" className="btn" onClick={onClose}>
            {project ? 'Close' : 'Cancel'}
          </button>
          <button type="submit" className="btn pri" disabled={busy}>
            {submit}
          </button>
        </div>
      </div>
      {touched && problem && (
        <p role="alert" className="adm-error">
          {problem.message}
        </p>
      )}
      <ProjectPageFields
        value={page}
        upload={upload}
        uploadApp={uploadApp}
        onChange={setPage}
        card={card}
        current={part}
        onCurrent={setPart}
      />
    </form>
  );
}
