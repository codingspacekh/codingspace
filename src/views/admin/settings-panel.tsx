import { useId, useState, type FormEvent } from 'react';
import { levelLabel } from '@/lib/format';
import { useSubjects } from '@/lib/subjects';

export type Section = { id: string; subject_id: string; title: string; sort: number };

export type Settings = {
  subject_id: string | null;
  section_id: string | null;
  level: number;
  minutes: number;
  problem_count: number;
  lang: 'en' | 'km';
  summary: string;
};

const SUMMARY_MAX = 500;

/** 03 ADM-05: subject → section (dependent), level, minutes, problems, language, summary; URL preview. */
export function SettingsPanel({
  kind,
  value,
  sections,
  slug,
  urlLocked,
  onChange,
  onCreateSection,
}: {
  kind: 'lesson' | 'life';
  value: Settings;
  sections: Section[];
  slug: string;
  urlLocked: boolean;
  onChange: (patch: Partial<Settings>) => void;
  /** Adds a section to the current subject; resolves to an error message, or null. */
  onCreateSection?: (title: string) => Promise<string | null>;
}) {
  const { subjects: allSubjects, subject: subjectOf } = useSubjects();
  const id = useId();
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [addError, setAddError] = useState('');
  const [busy, setBusy] = useState(false);

  async function addSection(e: FormEvent) {
    e.preventDefault();
    if (!onCreateSection || !newTitle.trim()) return;
    setBusy(true);
    const error = await onCreateSection(newTitle.trim());
    setBusy(false);
    if (error) return setAddError(error);
    setAdding(false);
    setNewTitle('');
    setAddError('');
  }
  const inSubject = sections.filter((s) => s.subject_id === value.subject_id).sort((a, b) => a.sort - b.sort);
  const num = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v) || min)));

  return (
    <aside className="ed-settings" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Settings</h2>
      {kind === 'lesson' && (
        <>
          <label>
            Subject
            <select
              value={value.subject_id ?? ''}
              onChange={(e) => {
                const subject = e.target.value || null;
                // A section belongs to one subject: changing the subject clears it.
                const keep = sections.some((s) => s.id === value.section_id && s.subject_id === subject);
                onChange({ subject_id: subject, section_id: keep ? value.section_id : null });
              }}
            >
              {allSubjects.map(({ id: s }) => (
                <option key={s} value={s}>
                  {subjectOf(s)?.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Section
            <select
              value={value.section_id ?? ''}
              aria-describedby={inSubject.length ? undefined : `${id}-nosec`}
              onChange={(e) => onChange({ section_id: e.target.value || null })}
            >
              <option value="">Choose a section…</option>
              {inSubject.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          {inSubject.length === 0 && (
            <p id={`${id}-nosec`} className="adm-hint">
              This subject has no sections yet.
            </p>
          )}
          {onCreateSection &&
            (adding ? (
              // Not a <form>: this panel sits inside the editor page, and Enter must not submit anything else.
              <div className="ed-new-section" role="group" aria-label="New section">
                <label>
                  New section title
                  <input
                    value={newTitle}
                    maxLength={120}
                    aria-invalid={addError ? true : undefined}
                    aria-describedby={addError ? `${id}-adderr` : `${id}-addhint`}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void addSection(e);
                      if (e.key === 'Escape') setAdding(false);
                    }}
                  />
                </label>
                {addError ? (
                  <p id={`${id}-adderr`} className="adm-error" role="alert">
                    {addError}
                  </p>
                ) : (
                  <p id={`${id}-addhint`} className="adm-hint">
                    Added at the end of {subjectOf(value.subject_id)?.name ?? 'the subject'}. It shows on the subject
                    page as “coming soon” until it has a lesson.
                  </p>
                )}
                <div className="adm-quick">
                  <button type="button" className="btn pri" disabled={busy || !newTitle.trim()} onClick={addSection}>
                    Add section
                  </button>
                  <button type="button" className="btn" onClick={() => setAdding(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn" onClick={() => setAdding(true)} disabled={!value.subject_id}>
                New section…
              </button>
            ))}
          <label>
            Level
            <select value={value.level} onChange={(e) => onChange({ level: Number(e.target.value) })}>
              {[1, 2, 3].map((l) => (
                <option key={l} value={l}>
                  {levelLabel(l)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Practice problems
            <input
              type="number"
              min={0}
              max={500}
              value={value.problem_count}
              onChange={(e) => onChange({ problem_count: num(e.target.value, 0, 500) })}
            />
          </label>
        </>
      )}
      <label>
        Reading time (minutes)
        <input
          type="number"
          min={1}
          max={600}
          value={value.minutes}
          onChange={(e) => onChange({ minutes: num(e.target.value, 1, 600) })}
        />
      </label>
      <label>
        Language
        <select value={value.lang} onChange={(e) => onChange({ lang: e.target.value as Settings['lang'] })}>
          <option value="en">English</option>
          <option value="km">Khmer</option>
        </select>
      </label>
      <label>
        Summary
        <textarea
          rows={4}
          maxLength={SUMMARY_MAX}
          value={value.summary}
          aria-describedby={`${id}-count`}
          onChange={(e) => onChange({ summary: e.target.value })}
        />
      </label>
      <p id={`${id}-count`} className="adm-hint">
        {value.summary.length}/{SUMMARY_MAX} characters. Shown on cards and in search results.
      </p>
      <div className="ed-url">
        <span className="ed-label">Address</span>
        <code>codingspacekh.dev/posts/{slug}</code>
        <p className="adm-hint">
          {urlLocked
            ? 'Fixed: the post has been published, and links to it must keep working.'
            : 'Follows the title until the post is first published.'}
        </p>
      </div>
    </aside>
  );
}
