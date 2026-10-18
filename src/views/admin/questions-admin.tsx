import { useCallback, useEffect, useId, useState } from 'react';
import { api } from '@/lib/admin-api';
import type { AdminQuestion, QuestionStatus } from '@/server/admin/questions';

type Reply = { error?: string; failed?: string[] };

const TABS: { status: QuestionStatus; label: string }[] = [
  { status: 'pending', label: 'Waiting' },
  { status: 'published', label: 'Published' },
  { status: 'hidden', label: 'Hidden' },
];

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * v1.1: questions students asked under lessons. Nothing is public until published here; the
 * answer (Markdown, $maths$) shows under the question, marked "Teacher".
 */
export function QuestionsAdmin() {
  const [tab, setTab] = useState<QuestionStatus>('pending');
  const [questions, setQuestions] = useState<AdminQuestion[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (status: QuestionStatus) => {
    const { status: code, data } = await api<{ questions?: AdminQuestion[] }>(`/api/admin/questions?status=${status}`);
    setFailed(code !== 200);
    if (code === 200) setQuestions(data.questions ?? []);
  }, []);

  useEffect(() => {
    // Loading the tab's questions is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(tab);
  }, [load, tab]);

  async function change(request: () => Promise<{ status: number; data: Reply }>, done: string) {
    setBusy(true);
    const { status, data } = await request().catch(() => ({ status: 0, data: {} as Reply }));
    setBusy(false);
    const ok = status === 200;
    setMessage(
      ok
        ? data.failed?.length
          ? `${done} The lesson page will catch up within 5 minutes.`
          : done
        : `Not done: ${data.error ?? 'try again'}.`,
    );
    await load(tab);
    return ok;
  }

  const save = (q: AdminQuestion, status: QuestionStatus, answer: string, done: string) =>
    change(() => api(`/api/admin/questions/${q.id}`, { method: 'PUT', body: { status, answer } }), done);

  return (
    <>
      <h1>Questions</h1>
      <p className="adm-lead">
        Questions students asked under lessons. Nothing shows on the site until you publish it; your answer appears
        under the question, marked “Teacher”.
      </p>
      <div role="group" aria-label="Show" className="ed-panels adm-subjects">
        {TABS.map((t) => (
          <button
            key={t.status}
            type="button"
            className="btn"
            aria-pressed={t.status === tab}
            onClick={() => {
              setQuestions(null);
              setTab(t.status);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="adm-live" role="status">
        {message}
      </p>
      {failed ? (
        <p role="alert" className="adm-error">
          The questions could not be loaded. Reload the page to try again.
        </p>
      ) : !questions ? (
        <p aria-live="polite">Loading…</p>
      ) : questions.length === 0 ? (
        <p className="empty">
          {tab === 'pending'
            ? 'No questions waiting.'
            : tab === 'published'
              ? 'Nothing published yet.'
              : 'Nothing hidden.'}
        </p>
      ) : (
        <ol className="adm-sections" aria-label={`${TABS.find((t) => t.status === tab)!.label} questions`}>
          {questions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              busy={busy}
              onSave={save}
              onDelete={() =>
                change(() => api(`/api/admin/questions/${q.id}`, { method: 'DELETE' }), `Deleted ${q.name}’s question.`)
              }
            />
          ))}
        </ol>
      )}
    </>
  );
}

function QuestionCard({
  question: q,
  busy,
  onSave,
  onDelete,
}: {
  question: AdminQuestion;
  busy: boolean;
  onSave: (q: AdminQuestion, status: QuestionStatus, answer: string, done: string) => Promise<boolean>;
  onDelete: () => void;
}) {
  const id = useId();
  const [answer, setAnswer] = useState(q.answer);
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="frame adm-section adm-q" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`}>
        {q.name} <span className="meta">· {when(q.created_at)}</span>
      </h2>
      <p className="meta">
        On{' '}
        {q.lesson ? (
          q.lesson.live ? (
            <a href={`/posts/${q.lesson.slug}#questions`} target="_blank" rel="noopener">
              {q.lesson.title}
            </a>
          ) : (
            `${q.lesson.title} (not live now)`
          )
        ) : (
          'a deleted lesson'
        )}
      </p>
      {/* The student's text exactly as typed: the site renders it (Markdown) once published. */}
      <p className="adm-q-body">{q.body}</p>
      <label htmlFor={`${id}-a`} className="adm-form-label">
        Your answer (Markdown, $maths$; optional)
      </label>
      <textarea id={`${id}-a`} rows={3} maxLength={4000} value={answer} onChange={(e) => setAnswer(e.target.value)} />
      <div className="adm-quick">
        {q.status !== 'published' && (
          <button
            type="button"
            className="btn pri"
            disabled={busy}
            onClick={() =>
              onSave(q, 'published', answer, answer.trim() ? 'Published, with your answer.' : 'Published.')
            }
          >
            {answer.trim() ? 'Publish with answer' : 'Publish'}
          </button>
        )}
        {q.status === 'published' && (
          <button
            type="button"
            className="btn pri"
            disabled={busy || answer === q.answer}
            onClick={() => onSave(q, 'published', answer, 'Answer saved.')}
          >
            Save answer
          </button>
        )}
        {q.status !== 'hidden' && (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() =>
              onSave(q, 'hidden', answer, q.status === 'published' ? 'Taken off the lesson page.' : 'Hidden.')
            }
          >
            Hide
          </button>
        )}
        {confirming ? (
          <span className="adm-confirm" role="group" aria-label="Confirm delete">
            Delete this question for good?
            <button type="button" className="btn adm-danger" disabled={busy} onClick={onDelete}>
              Delete question
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
            aria-label={`Delete ${q.name}’s question`}
          >
            Delete…
          </button>
        )}
      </div>
    </li>
  );
}
