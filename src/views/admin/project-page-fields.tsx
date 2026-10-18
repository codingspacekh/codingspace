import { useId, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { IMAGE_ACCEPT, type MediaKind } from '@/lib/media-rules';
import type { UploadedMedia } from '@/lib/media-upload';
import { thumbnailUrl } from '@/lib/media-urls';
import { moveItem } from '@/lib/post-rules';
import {
  isBlank,
  PROJECT_LIMITS,
  PROJECT_TEXT,
  type ProjectDownload,
  type ProjectFaq,
  type ProjectFeature,
  type ProjectReason,
  type ProjectStep,
} from '@/lib/project-page';
import { landingUrlProblem, optionalUrlProblem } from '@/lib/site-rules';
import type { AdminScreenshot } from '@/server/admin/site';
import { MediaPicker } from './media-library';

export type Upload = (file: File, kind: MediaKind) => Promise<UploadedMedia>;

/** The landing-page part of a project (v1.1): everything below the card's own fields. */
export type PageFields = {
  tagline: string;
  intro: string;
  reasons: ProjectReason[];
  features: ProjectFeature[];
  steps: ProjectStep[];
  faq: ProjectFaq[];
  downloads: ProjectDownload[];
  version: string;
  source_url: string;
  screenshots: AdminScreenshot[];
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
};

/** What stops saving in the page part, if anything (the server checks the same). */
export function pageProblem(p: PageFields): string | null {
  const kept = <T extends Record<string, string>>(items: T[]) => items.filter((i) => !isBlank(i));
  for (const [items, name] of [
    [p.reasons, 'reason'],
    [p.features, 'feature'],
    [p.steps, 'step'],
  ] as const)
    if (kept(items).some((i) => !i.title.trim())) return `Every ${name} needs a title (or remove the empty one).`;
  if (kept(p.faq).some((q) => !q.question.trim())) return 'Every question needs its text (or remove it).';
  for (const d of kept(p.downloads)) {
    if (!d.label.trim()) return 'Every download needs a label, like Windows.';
    const problem = landingUrlProblem(d.url);
    if (problem) return `Download “${d.label}”: ${problem}`;
  }
  const source = optionalUrlProblem(p.source_url);
  return source ? `Source code: ${source}` : null;
}

type Field<T> = { key: keyof T & string; label: string; max: number; long?: boolean; type?: 'url' };

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
  hint: string;
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
      <p className="adm-hint">{hint}</p>
      {items.length > 0 && (
        <ol className="adm-pj-list" aria-label={legend}>
          {items.map((item, i) => (
            <li key={i}>
              {fields.map((f) => (
                <label key={f.key}>
                  {f.label}
                  {f.long ? (
                    <textarea
                      id={`${id}-${i}-${f.key}`}
                      rows={2}
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
      <p className="adm-hint">
        Up to 8 images. The first one goes in the hero, next to the name; with two or more, all of them show in a
        Screenshots section too.
      </p>
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

/** A part of the form that opens on demand: the page has many sections. */
function Part({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  return (
    <details className="adm-pj-part">
      <summary>
        {title} <span className="meta">{summary}</span>
      </summary>
      {children}
    </details>
  );
}

const count = (n: number, one: string) => (n ? `${n} ${one}${n === 1 ? '' : 's'}` : 'none yet');

/**
 * The landing page's sections, in the order the page shows them. Sections left empty don't
 * show on the page.
 */
export function ProjectPageFields({
  value: p,
  upload,
  onChange,
}: {
  value: PageFields;
  upload: Upload;
  onChange: Dispatch<SetStateAction<PageFields>>;
}) {
  const set = <K extends keyof PageFields>(k: K, v: PageFields[K]) => onChange((prev) => ({ ...prev, [k]: v }));
  const L = PROJECT_LIMITS;
  const T = PROJECT_TEXT;
  const titled = [
    { key: 'title', label: 'Title', max: T.title },
    { key: 'text', label: 'Text', max: T.text, long: true },
  ] as const;

  return (
    <div className="adm-pj-page">
      <h3>The project’s page</h3>
      <p className="adm-hint">
        Its own landing page at /projects/…, in this order. Fill in what you need: an empty section doesn’t show.
      </p>
      <Part title="Hero" summary={p.tagline ? 'tagline set' : 'tagline and introduction'}>
        <label>
          Tagline: one sentence under the name (otherwise the short description)
          <input maxLength={T.tagline} value={p.tagline} onChange={(e) => set('tagline', e.target.value)} />
        </label>
        <label>
          Introduction (Markdown: **bold**, [links](https://…), lists)
          <textarea rows={5} maxLength={T.intro} value={p.intro} onChange={(e) => set('intro', e.target.value)} />
        </label>
      </Part>
      <Part title="Screenshots" summary={count(p.screenshots.length, 'image')}>
        <ScreenshotsEditor
          shots={p.screenshots}
          upload={upload}
          onChange={(update) => onChange((prev) => ({ ...prev, screenshots: update(prev.screenshots) }))}
        />
      </Part>
      <Part title="Why use it" summary={count(p.reasons.length, 'reason')}>
        <ListEditor<ProjectReason>
          legend="Reasons"
          hint="Why students (or teachers) should use it, e.g. “Free, no account”."
          noun="reason"
          items={p.reasons}
          fields={[...titled]}
          blank={{ title: '', text: '' }}
          max={L.reasons}
          onChange={(v) => set('reasons', v)}
        />
      </Part>
      <Part title="Features" summary={count(p.features.length, 'feature')}>
        <ListEditor<ProjectFeature>
          legend="Features"
          hint="What it does. The symbol (optional, up to 4 characters) shows above each one."
          noun="feature"
          items={p.features}
          fields={[{ key: 'glyph', label: 'Symbol', max: T.glyph }, ...titled]}
          blank={{ glyph: '', title: '', text: '' }}
          max={L.features}
          onChange={(v) => set('features', v)}
        />
      </Part>
      <Part title="Get started" summary={count(p.steps.length, 'step')}>
        <ListEditor<ProjectStep>
          legend="Steps"
          hint="How to install it or take the first steps, numbered in this order."
          noun="step"
          items={p.steps}
          fields={[...titled]}
          blank={{ title: '', text: '' }}
          max={L.steps}
          onChange={(v) => set('steps', v)}
        />
      </Part>
      <Part title="Questions" summary={count(p.faq.length, 'question')}>
        <ListEditor<ProjectFaq>
          legend="Questions"
          hint="Shown closed; a visitor opens one to read the answer (Markdown)."
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
      </Part>
      <Part
        title="Download"
        summary={
          p.downloads.length
            ? `${count(p.downloads.length, 'link')}${p.version ? `, version ${p.version}` : ''}`
            : 'Coming soon'
        }
      >
        <label>
          Version (optional, e.g. 1.2.0)
          <input maxLength={T.version} value={p.version} onChange={(e) => set('version', e.target.value)} />
        </label>
        <ListEditor<ProjectDownload>
          legend="Download links"
          hint="One button each. Paste the file’s link from the GitHub release (https://github.com/…/releases/download/…). With no links, the page says “Coming soon”."
          noun="download"
          items={p.downloads}
          fields={[
            { key: 'label', label: 'For (e.g. Windows, macOS, Android)', max: T.label },
            { key: 'url', label: 'Link', max: 500, type: 'url' },
          ]}
          blank={{ label: '', url: '' }}
          max={L.downloads}
          onChange={(v) => set('downloads', v)}
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
      </Part>
    </div>
  );
}
