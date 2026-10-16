import { useId, useState } from 'react';
import { scheduleProblem, type ChecklistItem } from '@/lib/post-rules';

const WHEN = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Phnom_Penh',
});

const SCHEDULE_ERRORS = {
  invalid: 'Pick a date and time.',
  too_soon: 'Pick a time at least a minute from now.',
  too_far: 'Pick a time within the next year.',
};

export type PublishState = {
  status: 'draft' | 'scheduled' | 'published';
  slug: string;
  scheduled_at: string | null;
  /** Saved or unsaved changes the live version doesn't have yet. */
  changes: boolean;
};

/**
 * 03 ADM-07 and ADM-09: "Ready to publish?" and the actions for the post's status.
 * Each action resolves when the server has answered; the page shows the result.
 */
export function PublishPanel({
  state,
  items,
  busy,
  onPublish,
  onUnpublish,
  onSchedule,
  onUnschedule,
}: {
  state: PublishState;
  items: ChecklistItem[];
  busy: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
  onSchedule: (at: Date) => void;
  onUnschedule: () => void;
}) {
  const id = useId();
  const [when, setWhen] = useState('');
  const [whenError, setWhenError] = useState('');
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const ready = items.every((i) => i.ok || !i.required);
  const missing = items.filter((i) => i.required && !i.ok).map((i) => i.label.toLowerCase());

  function schedule() {
    const at = new Date(when);
    const problem = scheduleProblem(at);
    if (problem) return setWhenError(SCHEDULE_ERRORS[problem]);
    setWhenError('');
    onSchedule(at);
  }

  return (
    <section className="ed-settings" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Ready to publish?</h2>
      <ul className="ed-checklist">
        {items.map((i) => (
          <li key={i.id} className={i.ok ? 'is-ok' : i.required ? 'is-missing' : 'is-warning'}>
            <span aria-hidden="true">{i.ok ? '✓' : i.required ? '✗' : '!'}</span>
            {i.label}
            <span className="sr-only">{i.ok ? ': done' : i.required ? ': required' : ': recommended'}</span>
            {!i.ok && <span className="adm-hint">{i.required ? 'Required' : 'Recommended'}</span>}
          </li>
        ))}
      </ul>
      {!ready && (
        <p className="adm-hint" id={`${id}-why`}>
          Add the {missing.join(', ')} to publish.
        </p>
      )}

      {state.status === 'published' ? (
        <>
          <p>
            Live at{' '}
            <a href={`/posts/${state.slug}`} target="_blank" rel="noopener">
              /posts/{state.slug}
            </a>
            {state.changes ? '. Your changes are not live yet.' : '. Up to date.'}
          </p>
          <button
            type="button"
            className="btn pri"
            disabled={busy || !ready || !state.changes}
            aria-describedby={ready ? undefined : `${id}-why`}
            onClick={onPublish}
          >
            Update
          </button>
          {confirmUnpublish ? (
            <div className="adm-confirm" role="group" aria-label="Confirm unpublish">
              <span>
                Take this post off the site? Students will get “page not found”. You can publish it again later.
              </span>
              <button
                type="button"
                className="btn adm-danger"
                disabled={busy}
                onClick={() => {
                  setConfirmUnpublish(false);
                  onUnpublish();
                }}
              >
                Unpublish
              </button>
              <button type="button" className="btn" onClick={() => setConfirmUnpublish(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="btn" disabled={busy} onClick={() => setConfirmUnpublish(true)}>
              Unpublish…
            </button>
          )}
        </>
      ) : (
        <>
          {state.status === 'scheduled' && state.scheduled_at && (
            <p>
              Scheduled for <strong>{WHEN.format(new Date(state.scheduled_at))}</strong> (Phnom Penh time). It goes live
              within 5 minutes of that time, with the draft as it is then.
            </p>
          )}
          <button
            type="button"
            className="btn pri"
            disabled={busy || !ready}
            aria-describedby={ready ? undefined : `${id}-why`}
            onClick={onPublish}
          >
            Publish now
          </button>
          {state.status === 'scheduled' ? (
            <button type="button" className="btn" disabled={busy} onClick={onUnschedule}>
              Cancel the schedule
            </button>
          ) : (
            <div className="ed-schedule">
              <label>
                Or publish later
                <input
                  type="datetime-local"
                  value={when}
                  aria-invalid={whenError ? true : undefined}
                  aria-describedby={whenError ? `${id}-when` : undefined}
                  onChange={(e) => setWhen(e.target.value)}
                />
              </label>
              {whenError && (
                <p id={`${id}-when`} className="adm-error" role="alert">
                  {whenError}
                </p>
              )}
              <button type="button" className="btn" disabled={busy || !ready || !when} onClick={schedule}>
                Schedule
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
