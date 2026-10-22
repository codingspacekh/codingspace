import { useId, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { IMAGE_ACCEPT, type MediaKind } from '@/lib/media-rules';
import type { UploadedMedia } from '@/lib/media-upload';
import { thumbnailUrl } from '@/lib/media-urls';
import { moveItem } from '@/lib/post-rules';
import {
  isBlank,
  PAGE_SECTIONS,
  PROJECT_LIMITS,
  PROJECT_TEXT,
  SECTION_NAMES,
  sectionOrder,
  STEP_PLATFORMS,
  type PageSection,
  type ProjectFaq,
  type ProjectFeature,
  type ProjectHighlight,
  type ProjectReason,
  type ProjectReplaced,
  type ProjectRequirement,
  type ShowcaseColor,
  type ShowcasePoint,
  type StepPlatform,
} from '@/lib/project-page';
import { optionalUrlProblem } from '@/lib/site-rules';
import type { AdminScreenshot } from '@/server/admin/site';
import { DownloadsEditor, downloadsProblem, type AdminDownload, type AppUpload } from './download-fields';
import { MediaPicker } from './media-library';
import { ShowcaseEditor } from './showcase-fields';

export type Upload = (file: File, kind: MediaKind) => Promise<UploadedMedia>;

/** An install step as the form edits it ('' = any computer). */
export type AdminStep = { title: string; text: string; platform: StepPlatform | '' };

/** A showcase row as the form edits it: the points stay one text, a line each, until saving. */
export type AdminShowcaseRow = {
  media_id: string;
  widths: number[];
  label: string;
  title: string;
  text: string;
  /** "V4: Titles and captions", one per line; the code before the colon is optional. */
  points: string;
  color: ShowcaseColor | '';
};

/** "V4: Captions" → { code: 'V4', text: 'Captions' }; a line without a short code is all text. */
export function parsePoints(text: string): ShowcasePoint[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = /^([^\s:]{1,8}):\s*(.+)$/.exec(line);
      return m ? { code: m[1]!, text: m[2]! } : { code: '', text: line };
    });
}
export const pointsText = (points: ShowcasePoint[]) =>
  points.map((p) => (p.code ? `${p.code}: ${p.text}` : p.text)).join('\n');

/** The landing-page part of a project (v1.1, redesigned 2026-10-20): everything below the card's own fields. */
export type PageFields = {
  tagline: string;
  intro: string;
  reasons: ProjectReason[];
  features: ProjectFeature[];
  steps: AdminStep[];
  faq: ProjectFaq[];
  downloads: AdminDownload[];
  version: string;
  source_url: string;
  screenshots: AdminScreenshot[];
  highlights: ProjectHighlight[];
  why_title: string;
  why_text: string;
  replaces: ProjectReplaced[];
  requirements: ProjectRequirement[];
  requirements_note: string;
  release_date: string;
  release_notes: string;
  /** Says "Coming soon" on the card and page while there is no download. */
  coming_soon: boolean;
  /** Every section, in the page's order. */
  section_order: PageSection[];
  hidden_sections: PageSection[];
  showcase: AdminShowcaseRow[];
};

export const EMPTY_PAGE: PageFields = {
  tagline: '',
  intro: '',
  reasons: [],
  features: [],
  steps: [],
  faq: [],
  downloads: [],
  version: '',
  source_url: '',
  screenshots: [],
  highlights: [],
  why_title: '',
  why_text: '',
  replaces: [],
  requirements: [],
  requirements_note: '',
  release_date: '',
  release_notes: '',
  coming_soon: false,
  section_order: [...PAGE_SECTIONS],
  hidden_sections: [],
  showcase: [],
};

/** What stops saving in the page part, if anything, and the part to fix it in (the server checks the same). */
export function pageProblem(p: PageFields): { part: PageSection | 'hero'; message: string } | null {
  const kept = <T extends Record<string, string>>(items: T[]) => items.filter((i) => !isBlank(i));
  for (const [items, name, part] of [
    [p.reasons, 'reason', 'why'],
    [p.features, 'feature', 'features'],
    [p.steps, 'step', 'install'],
  ] as const)
    if (kept(items).some((i) => !i.title.trim()))
      return { part, message: `Every ${name} needs a title (or remove the empty one).` };
  if (kept(p.highlights).some((h) => !h.value.trim()))
    return { part: 'numbers', message: 'Every number needs its value, like 4 GB (or remove it).' };
  if (kept(p.replaces).some((r) => !r.name.trim()))
    return { part: 'why', message: 'Every “Before” item needs a name (or remove it).' };
  if (kept(p.requirements).some((r) => !r.part.trim()))
    return { part: 'requirements', message: 'Every requirement needs a name, like Memory (or remove it).' };
  if (p.showcase.some((r) => !r.title.trim()))
    return { part: 'showcase', message: 'Every showcase row needs a title (or remove it).' };
  if (kept(p.faq).some((q) => !q.question.trim()))
    return { part: 'faq', message: 'Every question needs its text (or remove it).' };
  const downloads = downloadsProblem(p.downloads);
  if (downloads) return { part: 'download', message: downloads };
  const source = optionalUrlProblem(p.source_url);
  return source ? { part: 'download', message: `Source code: ${source}` } : null;
}

type Field<T> = {
  key: keyof T & string;
  label: string;
  max: number;
  long?: boolean;
  type?: 'url';
  /** A choice instead of text: value → name. */
  options?: Record<string, string>;
};

/** An ordered list of small items (reasons, features…): add, edit, move, remove. */
function ListEditor<T extends Record<string, string>>({
  legend,
  hint,
  noun,
  items,
  fields,
  blank,
  max,
  onChange,
}: {
  legend: string;
  hint?: string;
  /** "reason" → "Add a reason", "Remove reason 2". */
  noun: string;
  items: T[];
  fields: Field<T>[];
  blank: T;
  max: number;
  onChange: (items: T[]) => void;
}) {
  const id = useId();
  const set = (i: number, key: keyof T, v: string) =>
    onChange(items.map((item, j) => (j === i ? { ...item, [key]: v } : item)));
  return (
    <fieldset className="adm-fieldset">
      <legend>{legend}</legend>
      {hint && <p className="adm-hint">{hint}</p>}
      {items.length > 0 && (
        <ol className="adm-pj-list adm-pj-items" aria-label={legend}>
          {items.map((item, i) => (
            <li key={i}>
              {fields.map((f) => (
                <label key={f.key}>
                  {f.label}
                  {f.options ? (
                    <select
                      id={`${id}-${i}-${f.key}`}
                      value={item[f.key]}
                      onChange={(e) => set(i, f.key, e.target.value)}
                    >
                      {Object.entries(f.options).map(([value, name]) => (
                        <option key={value} value={value}>
                          {name}
                        </option>
                      ))}
                    </select>
                  ) : f.long ? (
                    <textarea
                      id={`${id}-${i}-${f.key}`}
                      rows={3}
                      maxLength={f.max}
                      value={item[f.key]}
                      onChange={(e) => set(i, f.key, e.target.value)}
                    />
                  ) : (
                    <input
                      id={`${id}-${i}-${f.key}`}
                      type={f.type ?? 'text'}
                      inputMode={f.type === 'url' ? 'url' : undefined}
                      maxLength={f.max}
                      value={item[f.key]}
                      onChange={(e) => set(i, f.key, e.target.value)}
                    />
                  )}
                </label>
              ))}
              <span className="adm-quick">
                <button
                  type="button"
                  className="btn"
                  disabled={i === 0}
                  aria-label={`Move ${noun} ${i + 1} up`}
                  onClick={() => onChange(moveItem(items, i, -1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={i === items.length - 1}
                  aria-label={`Move ${noun} ${i + 1} down`}
                  onClick={() => onChange(moveItem(items, i, 1))}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn"
                  aria-label={`Remove ${noun} ${i + 1}`}
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
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
        disabled={items.length >= max}
        onClick={() => onChange([...items, { ...blank }])}
      >
        Add a {noun}
      </button>
    </fieldset>
  );
}

/** Screenshots from the media library, in order, each with an optional caption. */
function ScreenshotsEditor({
  shots,
  upload,
  onChange,
}: {
  shots: AdminScreenshot[];
  upload: Upload;
  /** Takes an update: several uploads finish one after another. */
  onChange: (update: (prev: AdminScreenshot[]) => AdminScreenshot[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');
  const [picking, setPicking] = useState(false);
  const full = shots.length >= PROJECT_LIMITS.screenshots;

  /** Adds an image at the end; one already there, or a ninth, is left out. */
  const add = (s: AdminScreenshot) =>
    onChange((prev) =>
      prev.some((x) => x.media_id === s.media_id) || prev.length >= PROJECT_LIMITS.screenshots ? prev : [...prev, s],
    );

  async function chosen(files: File[]) {
    for (const file of files) {
      setNote(`Uploading “${file.name}”…`);
      try {
        const m = await upload(file, 'image');
        add({ media_id: m.id, caption: '', widths: m.widths });
        setNote(`“${file.name}” added. Save to show it on the page.`);
      } catch (e) {
        setNote(`Couldn’t upload “${file.name}”: ${e instanceof Error ? e.message : 'try again'}`);
      }
    }
  }

  return (
    <fieldset className="adm-fieldset">
      <legend>Screenshots</legend>
      {shots.length > 0 && (
        <ol className="adm-pj-shots" aria-label="Screenshots">
          {shots.map((s, i) => (
            <li key={s.media_id}>
              {thumbnailUrl(s.media_id, s.widths) && (
                <img src={thumbnailUrl(s.media_id, s.widths)!} alt={`Screenshot ${i + 1}`} width={120} />
              )}
              <label>
                Caption (optional)
                <input
                  maxLength={PROJECT_TEXT.caption}
                  value={s.caption}
                  onChange={(e) => {
                    const caption = e.target.value;
                    onChange((prev) => prev.map((x, j) => (j === i ? { ...x, caption } : x)));
                  }}
                />
              </label>
              <span className="adm-quick">
                <button
                  type="button"
                  className="btn"
                  disabled={i === 0}
                  aria-label={`Move screenshot ${i + 1} up`}
                  onClick={() => onChange((prev) => moveItem(prev, i, -1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={i === shots.length - 1}
                  aria-label={`Move screenshot ${i + 1} down`}
                  onClick={() => onChange((prev) => moveItem(prev, i, 1))}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn"
                  aria-label={`Remove screenshot ${i + 1}`}
                  onClick={() => onChange((prev) => prev.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="adm-quick">
        <button type="button" className="btn" disabled={full} onClick={() => input.current?.click()}>
          Upload screenshots
        </button>
        <button type="button" className="btn" disabled={full} onClick={() => setPicking(true)}>
          Choose from the media library
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        hidden
        aria-label="Upload screenshots"
        onChange={(e) => {
          void chosen([...(e.target.files ?? [])]);
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
            if (m.kind !== 'image') return setNote('Choose an image, not a file.');
            add({ media_id: m.id, caption: '', widths: m.widths });
            setNote(`“${m.original_name}” added. Save to show it on the page.`);
          }}
        />
      )}
    </fieldset>
  );
}

/** A part of the editor: the card, the hero, or one of the page's sections. */
export type PagePart = 'card' | 'hero' | PageSection;

const count = (n: number, one: string) => (n ? `${n} ${one}${n === 1 ? '' : 's'}` : 'none yet');

/** Whether a section has anything to show; an empty one is left out of the page (as in project-page.tsx). */
function filled(p: PageFields, s: PageSection): boolean {
  switch (s) {
    case 'numbers':
      return p.highlights.length > 0;
    case 'why':
      return p.reasons.length > 0 || p.replaces.length > 0;
    case 'showcase':
      return p.showcase.length > 0;
    case 'features':
      return p.features.length > 0;
    case 'screenshots':
      return p.screenshots.length > 1;
    case 'requirements':
      return p.requirements.length > 0;
    case 'download':
      return p.downloads.length > 0 || p.coming_soon; // "Coming soon" with no downloads yet
    case 'install':
      return p.steps.length > 0;
    case 'faq':
      return p.faq.length > 0;
  }
}

/** One part's panel: only the chosen one shows, but all stay mounted so uploads keep running. */
function Panel({
  title,
  lead,
  summary,
  current,
  children,
  section,
}: {
  title: string;
  lead: string;
  summary?: string;
  current: boolean;
  children: ReactNode;
  /** A page section: shown or hidden, and moved up or down among the others. */
  section?: {
    shown: boolean;
    first: boolean;
    last: boolean;
    onShow: (on: boolean) => void;
    onMove: (delta: -1 | 1) => void;
  };
}) {
  const id = useId();
  return (
    <section className="frame adm-pj-panel" hidden={!current} aria-labelledby={`${id}-h`}>
      <div className="adm-pj-panel-head">
        <div>
          <h2 id={`${id}-h`}>
            {title} {summary && <span className="meta">{summary}</span>}
          </h2>
          <p>{lead}</p>
        </div>
        {section && (
          <div className="adm-pj-controls">
            <label className="adm-switch">
              <input type="checkbox" checked={section.shown} onChange={(e) => section.onShow(e.target.checked)} />
              Show on the page
            </label>
            <span className="adm-quick">
              <button type="button" className="btn" disabled={section.first} onClick={() => section.onMove(-1)}>
                Move up <span className="sr-only">{title}</span>
              </button>
              <button type="button" className="btn" disabled={section.last} onClick={() => section.onMove(1)}>
                Move down <span className="sr-only">{title}</span>
              </button>
            </span>
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

const STEP_OPTIONS = { '': 'Any computer', ...STEP_PLATFORMS };

/**
 * The project editor (redesigned 2026-10-20, from the prototype): a list of the page's parts on the
 * left (the card, the hero, then the sections in the page's order, dragged or moved to reorder) and
 * the chosen part's panel on the right. A section can be hidden; an empty one doesn't show either.
 */
export function ProjectPageFields({
  value: p,
  upload,
  uploadApp,
  onChange,
  card,
  current,
  onCurrent,
}: {
  value: PageFields;
  upload: Upload;
  uploadApp: AppUpload;
  onChange: Dispatch<SetStateAction<PageFields>>;
  /** The card's own fields (name, description…), the first panel. */
  card: ReactNode;
  current: PagePart;
  onCurrent: (part: PagePart) => void;
}) {
  const set = <K extends keyof PageFields>(k: K, v: PageFields[K]) => onChange((prev) => ({ ...prev, [k]: v }));
  const [dragging, setDragging] = useState<number | null>(null);
  const L = PROJECT_LIMITS;
  const T = PROJECT_TEXT;
  const titled = [
    { key: 'title', label: 'Title', max: T.title },
    { key: 'text', label: 'Text', max: T.text, long: true },
  ] as const;
  const order = sectionOrder(p.section_order);

  /** Puts the section at `from` in place `to` (drag and drop, or one step with the buttons). */
  const place = (from: number, to: number) =>
    onChange((prev) => {
      const next = sectionOrder(prev.section_order);
      const [s] = next.splice(from, 1);
      next.splice(to, 0, s!);
      return { ...prev, section_order: next };
    });

  const control = (s: PageSection, i: number) => ({
    shown: !p.hidden_sections.includes(s),
    first: i === 0,
    last: i === order.length - 1,
    onShow: (on: boolean) =>
      onChange((prev) => ({
        ...prev,
        hidden_sections: on ? prev.hidden_sections.filter((h) => h !== s) : [...prev.hidden_sections, s],
      })),
    onMove: (delta: -1 | 1) => place(i, i + delta),
  });

  const sections: Record<PageSection, { lead: string; summary: string; body: ReactNode }> = {
    numbers: {
      lead: 'Up to 4 big facts in a strip under the hero: a short value and one line, e.g. “4 GB” · “of RAM is enough”.',
      summary: count(p.highlights.length, 'number'),
      body: (
        <ListEditor<ProjectHighlight>
          legend="Numbers"
          noun="number"
          items={p.highlights}
          fields={[
            { key: 'value', label: 'Value', max: T.value },
            { key: 'label', label: 'Line', max: T.highlight },
          ]}
          blank={{ value: '', label: '' }}
          max={L.highlights}
          onChange={(v) => set('highlights', v)}
        />
      ),
    },
    why: {
      lead: 'Why students (or teachers) should use it. With a Before list, the reasons show beside it as “Now”.',
      summary: count(p.reasons.length, 'reason'),
      body: (
        <>
          <div className="adm-pj-fields">
            <label>
              Heading (otherwise “Why {'<name>'}?”)
              <input maxLength={T.whyTitle} value={p.why_title} onChange={(e) => set('why_title', e.target.value)} />
            </label>
            <label className="adm-pj-wide">
              Text under the heading (optional)
              <textarea
                rows={2}
                maxLength={T.whyText}
                value={p.why_text}
                onChange={(e) => set('why_text', e.target.value)}
              />
            </label>
          </div>
          <ListEditor<ProjectReplaced>
            legend="Before"
            hint="What students had to use before (optional)."
            noun="“Before” item"
            items={p.replaces}
            fields={[
              { key: 'name', label: 'Name', max: T.replacedName },
              { key: 'note', label: 'Note (e.g. needs a strong GPU)', max: T.replacedName },
            ]}
            blank={{ name: '', note: '' }}
            max={L.replaces}
            onChange={(v) => set('replaces', v)}
          />
          <ListEditor<ProjectReason>
            legend="Reasons"
            hint="E.g. “Free, no account”."
            noun="reason"
            items={p.reasons}
            fields={[...titled]}
            blank={{ title: '', text: '' }}
            max={L.reasons}
            onChange={(v) => set('reasons', v)}
          />
        </>
      ),
    },
    showcase: {
      lead: 'Big rows, each a screenshot and its text, alternating left and right. Good for each mode or main feature.',
      summary: count(p.showcase.length, 'row'),
      body: (
        <ShowcaseEditor
          rows={p.showcase}
          upload={upload}
          onChange={(update) => onChange((prev) => ({ ...prev, showcase: update(prev.showcase) }))}
        />
      ),
    },
    features: {
      lead: 'What it does, in a grid. The symbol (optional, up to 4 characters) shows above each one.',
      summary: count(p.features.length, 'feature'),
      body: (
        <ListEditor<ProjectFeature>
          legend="Features"
          noun="feature"
          items={p.features}
          fields={[{ key: 'glyph', label: 'Symbol', max: T.glyph }, ...titled]}
          blank={{ glyph: '', title: '', text: '' }}
          max={L.features}
          onChange={(v) => set('features', v)}
        />
      ),
    },
    screenshots: {
      lead: 'Up to 8 images. The first one goes in the hero, next to the name; with two or more, all of them show in this section too.',
      summary: count(p.screenshots.length, 'image'),
      body: (
        <ScreenshotsEditor
          shots={p.screenshots}
          upload={upload}
          onChange={(update) => onChange((prev) => ({ ...prev, screenshots: update(prev.screenshots) }))}
        />
      ),
    },
    requirements: {
      lead: 'A table with a row per part of the computer. Leave Recommended empty everywhere to show one column.',
      summary: count(p.requirements.length, 'row'),
      body: (
        <>
          <label>
            Note above the table (optional, e.g. “If it runs Windows 11, it meets the minimum.”)
            <input
              maxLength={T.requirementsNote}
              value={p.requirements_note}
              onChange={(e) => set('requirements_note', e.target.value)}
            />
          </label>
          <ListEditor<ProjectRequirement>
            legend="System requirements"
            noun="requirement"
            items={p.requirements}
            fields={[
              { key: 'part', label: 'Part (e.g. Memory)', max: T.part },
              { key: 'minimum', label: 'Minimum', max: T.requirement },
              { key: 'recommended', label: 'Recommended', max: T.requirement },
            ]}
            blank={{ part: '', minimum: '', recommended: '' }}
            max={L.requirements}
            onChange={(v) => set('requirements', v)}
          />
        </>
      ),
    },
    download: {
      lead: 'The release and its download buttons. The hero’s button picks the one for the visitor’s computer.',
      summary: p.downloads.length
        ? `${count(p.downloads.length, 'download')}${p.version ? `, version ${p.version}` : ''}`
        : p.coming_soon
          ? 'Coming soon'
          : 'none yet',
      body: (
        <>
          <label className="adm-inline">
            <input type="checkbox" checked={p.coming_soon} onChange={(e) => set('coming_soon', e.target.checked)} />
            Coming soon: say so on its card and page until it has a download
          </label>
          <div className="adm-pj-fields">
            <label>
              Version (optional, e.g. 1.2.0)
              <input maxLength={T.version} value={p.version} onChange={(e) => set('version', e.target.value)} />
            </label>
            <label>
              Release date (optional)
              <input type="date" value={p.release_date} onChange={(e) => set('release_date', e.target.value)} />
            </label>
            <label className="adm-pj-wide">
              What’s new (optional, one change per line)
              <textarea
                rows={3}
                maxLength={T.releaseNotes}
                value={p.release_notes}
                onChange={(e) => set('release_notes', e.target.value)}
              />
            </label>
          </div>
          <DownloadsEditor
            downloads={p.downloads}
            uploadApp={uploadApp}
            onChange={(update) => onChange((prev) => ({ ...prev, downloads: update(prev.downloads) }))}
          />
          <label>
            Source code (optional, e.g. the GitHub repository)
            <input
              type="url"
              inputMode="url"
              maxLength={500}
              value={p.source_url}
              onChange={(e) => set('source_url', e.target.value)}
            />
          </label>
        </>
      ),
    },
    install: {
      lead: 'How to install it, in order. Give steps a computer to show them as tabs (Windows, macOS…); a step for any computer shows in every tab.',
      summary: count(p.steps.length, 'step'),
      body: (
        <ListEditor<AdminStep>
          legend="Steps"
          noun="step"
          items={p.steps}
          fields={[...titled, { key: 'platform', label: 'For', max: 20, options: STEP_OPTIONS }]}
          blank={{ title: '', text: '', platform: '' }}
          max={L.steps}
          onChange={(v) => set('steps', v)}
        />
      ),
    },
    faq: {
      lead: 'Shown closed; a visitor opens one to read the answer (Markdown).',
      summary: count(p.faq.length, 'question'),
      body: (
        <ListEditor<ProjectFaq>
          legend="Questions"
          noun="question"
          items={p.faq}
          fields={[
            { key: 'question', label: 'Question', max: T.question },
            { key: 'answer', label: 'Answer', max: T.answer, long: true },
          ]}
          blank={{ question: '', answer: '' }}
          max={L.faq}
          onChange={(v) => set('faq', v)}
        />
      ),
    },
  };

  const navItem = (part: PagePart, name: string, state?: string) => (
    <button type="button" aria-current={current === part} onClick={() => onCurrent(part)}>
      <span>{name}</span>
      {state && (
        <span className={`adm-pj-state adm-pj-state--${state}`}>
          <span className="sr-only">, </span>
          {state}
        </span>
      )}
    </button>
  );

  return (
    <div className="adm-pj">
      <nav className="frame adm-pj-nav" aria-label="Page parts">
        <ul>
          <li>{navItem('card', 'Card')}</li>
          <li>{navItem('hero', 'Hero')}</li>
        </ul>
        <p className="meta">Sections · drag to reorder</p>
        <ol aria-label="Sections, in the page’s order">
          {order.map((s, i) => (
            <li
              key={s}
              draggable
              className={dragging === i ? 'adm-pj-dragging' : undefined}
              onDragStart={(e) => {
                setDragging(i);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', s);
              }}
              onDragOver={(e) => {
                if (dragging === null) return;
                e.preventDefault();
                if (dragging !== i) {
                  place(dragging, i);
                  setDragging(i);
                }
              }}
              onDrop={(e) => e.preventDefault()}
              onDragEnd={() => setDragging(null)}
            >
              <span className="adm-pj-grip" aria-hidden="true">
                ⋮⋮
              </span>
              {navItem(s, SECTION_NAMES[s], p.hidden_sections.includes(s) ? 'off' : filled(p, s) ? 'on' : 'empty')}
            </li>
          ))}
        </ol>
        <p className="adm-hint">An empty section doesn’t show on the page.</p>
      </nav>
      <div className="adm-pj-panels">
        <Panel
          title="Card"
          lead="The card on Projects and Home. The name and icon head the page too."
          current={current === 'card'}
        >
          {card}
        </Panel>
        <Panel
          title="Hero"
          lead="The top of the page. Its picture is the first screenshot, and its button the download for the visitor’s computer."
          current={current === 'hero'}
        >
          <label>
            Tagline: one sentence under the name (otherwise the short description)
            <input maxLength={T.tagline} value={p.tagline} onChange={(e) => set('tagline', e.target.value)} />
          </label>
          <label>
            Introduction (Markdown: **bold**, [links](https://…), lists)
            <textarea rows={6} maxLength={T.intro} value={p.intro} onChange={(e) => set('intro', e.target.value)} />
          </label>
        </Panel>
        {order.map((s, i) => (
          <Panel
            key={s}
            title={SECTION_NAMES[s]}
            lead={sections[s].lead}
            summary={sections[s].summary}
            current={current === s}
            section={control(s, i)}
          >
            {sections[s].body}
          </Panel>
        ))}
      </div>
    </div>
  );
}
