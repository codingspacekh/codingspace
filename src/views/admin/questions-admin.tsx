import { useCallback, useEffect, useId, useState } from 'react';
import { api } from '@/lib/admin-api';
import type { AdminQuestion, QuestionInbox, QuestionStatus } from '@/server/admin/questions';

type Reply = { error?: string; failed?: string[] };

const TABS: { status: QuestionStatus; label: string }[] = [
  { status: 'pending', label: 'Waiting' },
  { status: 'published', label: 'Published' },
  { status: 'hidden', label: 'Hidden' },
];

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

type PostFilter = { slug: string; title: string };

const inboxUrl = (status: QuestionStatus, post: PostFilter | null, extra: Record<string, string> = {}) =>
  `/api/admin/questions?${new URLSearchParams({ status, ...(post ? { post: post.slug } : {}), ...extra })}`;

/**
 * v1.1: questions students asked under lessons and comments on life posts. Nothing is public
 * until published here; the answer or reply (Markdown, $maths$) shows under it, marked "Teacher".
 * Each tab shows its count and loads 50 at a time ("Load more"); "Only this post" narrows it all
 * to one lesson or life post.
 */
export function QuestionsAdmin() {
  const [tab, setTab] = useState<QuestionStatus>('pending');
  const [post, setPost] = useState<PostFilter | null>(null);
  const [inbox, setInbox] = useState<QuestionInbox | null>(null);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Kept while another tab loads, so the numbers don't flicker.
  const [counts, setCounts] = useState<QuestionInbox['counts'] | null>(null);
  const questions = inbox?.questions ?? null;

  /** The tab from the top; `shown` keeps that many loaded (after a change, the list stays as long). */
  const load = useCallback(async (status: QuestionStatus, filter: PostFilter | null, shown = 0) => {
    const { status: code, data } = await api<QuestionInbox>(
      inboxUrl(status, filter, shown > 50 ? { limit: String(Math.min(shown, 500)) } : {}),
    );
    setFailed(code !== 200);
    if (code !== 200) return;
    setInbox(data);
    setCounts(data.counts);
  }, []);

  useEffect(() => {
    // Loading the tab's questions is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(tab, post);
  }, [load, tab, post]);

  async function loadMore() {
    if (!inbox?.questions.length) return;
    setLoadingMore(true);
    const { status: code, data } = await api<QuestionInbox>(
      inboxUrl(tab, post, { before: inbox.questions[inbox.questions.length - 1]!.created_at }),
    );
    setLoadingMore(false);
    if (code !== 200) return setMessage('Not loaded: try again.');
    setInbox({ ...data, questions: [...inbox.questions, ...data.questions] });
    setCounts(data.counts);
  }

  function only(filter: PostFilter | null) {
    setInbox(null);
    setCounts(null);
    setMessage('');
    setPost(filter);
  }

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
    await load(tab, post, questions?.length ?? 0);
    return ok;
  }

  const save = (q: AdminQuestion, status: QuestionStatus, answer: string, done: string) =>
    change(() => api(`/api/admin/questions/${q.id}`, { method: 'PUT', body: { status, answer } }), done);

  return (
    <>
      <h1>Questions &amp; comments</h1>
      <p className="adm-lead">
        Questions students asked under lessons and comments on your life posts. Nothing shows on the site until you
        publish it; your answer or reply appears under it, marked “Teacher”.
      </p>
      <div role="group" aria-label="Show" className="ed-panels adm-subjects">
        {TABS.map((t) => (
          <button
            key={t.status}
            type="button"
            className="btn"
            aria-pressed={t.status === tab}
            onClick={() => {
              setInbox(null);
              setTab(t.status);
            }}
          >
            {counts ? `${t.label} (${counts[t.status]})` : t.label}
          </button>
        ))}
      </div>
      {post && (
        <p className="adm-filter">
          Only <strong>{post.title}</strong>{' '}
          <button type="button" className="btn" onClick={() => only(null)}>
            Show all posts
          </button>
        </p>
      )}
      <p className="adm-live" role="status">
        {message}
      </p>
      {failed ? (
        <p role="alert" className="adm-error">
          The questions and comments could not be loaded. Reload the page to try again.
        </p>
      ) : !questions ? (
        <p aria-live="polite">Loading…</p>
      ) : questions.length === 0 ? (
        <p className="empty">
          {tab === 'pending' ? 'Nothing waiting.' : tab === 'published' ? 'Nothing published yet.' : 'Nothing hidden.'}
        </p>
      ) : (
        <ol className="adm-sections" aria-label={`${TABS.find((t) => t.status === tab)!.label} questions and comments`}>
          {questions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              busy={busy}
              onSave={save}
              onOnly={post ? undefined : only}
              onDelete={() =>
                change(
                  () => api(`/api/admin/questions/${q.id}`, { method: 'DELETE' }),
                  `Deleted ${q.name}’s ${noun(q)}.`,
                )
              }
            />
          ))}
        </ol>
      )}
      {inbox && inbox.more > 0 && (
        <p className="adm-loadmore">
          <button type="button" className="btn" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? 'Loading…' : `Load more (${inbox.more} older)`}
          </button>
        </p>
      )}
    </>
  );
}

/** A comment if it was written under a life post, a question otherwise. */
const noun = (q: AdminQuestion) => (q.lesson?.kind === 'life' ? 'comment' : 'question');

function QuestionCard({
  question: q,
  busy,
  onSave,
  onOnly,
  onDelete,
}: {
  question: AdminQuestion;
  busy: boolean;
  onSave: (q: AdminQuestion, status: QuestionStatus, answer: string, done: string) => Promise<boolean>;
  /** Show only the questions and comments under this card's post (left out when already filtered). */
  onOnly?: (post: PostFilter) => void;
  onDelete: () => void;
}) {
  const id = useId();
  const [answer, setAnswer] = useState(q.answer);
  const [confirming, setConfirming] = useState(false);
  const comment = noun(q) === 'comment';
  const reply = comment ? 'reply' : 'answer';
  return (
    <li className="frame adm-section adm-q" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`}>
        {q.name} <span className="meta">· {when(q.created_at)}</span>
      </h2>
      <p className="meta">
        {comment ? 'Comment on' : 'Question on'}{' '}
        {q.lesson ? (
          q.lesson.live ? (
            <a href={`/posts/${q.lesson.slug}#${comment ? 'comments' : 'questions'}`} target="_blank" rel="noopener">
              {q.lesson.title}
            </a>
          ) : (
            `${q.lesson.title} (not live now)`
          )
        ) : (
          'a deleted post'
        )}
        {onOnly && q.lesson && (
          <>
            {' '}
            <button
              type="button"
              className="btn adm-only"
              onClick={() => onOnly({ slug: q.lesson!.slug, title: q.lesson!.title })}
              aria-label={`Only this post: ${q.lesson.title}`}
            >
              Only this post
            </button>
          </>
        )}
      </p>
      {/* The student's text exactly as typed: the site renders it (Markdown) once published. */}
      <p className="adm-q-body">{q.body}</p>
      <label htmlFor={`${id}-a`} className="adm-form-label">
        Your {reply} (Markdown, $maths$; optional)
      </label>
      <textarea id={`${id}-a`} rows={3} maxLength={4000} value={answer} onChange={(e) => setAnswer(e.target.value)} />
      <div className="adm-quick">
        {q.status !== 'published' && (
          <button
            type="button"
            className="btn pri"
            disabled={busy}
            onClick={() =>
              onSave(q, 'published', answer, answer.trim() ? `Published, with your ${reply}.` : 'Published.')
            }
          >
            {answer.trim() ? `Publish with ${reply}` : 'Publish'}
          </button>
        )}
        {q.status === 'published' && (
          <button
            type="button"
            className="btn pri"
            disabled={busy || answer === q.answer}
            onClick={() => onSave(q, 'published', answer, comment ? 'Reply saved.' : 'Answer saved.')}
          >
            Save {reply}
          </button>
        )}
        {q.status !== 'hidden' && (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => onSave(q, 'hidden', answer, q.status === 'published' ? 'Taken off the page.' : 'Hidden.')}
          >
            Hide
          </button>
        )}
        {confirming ? (
          <span className="adm-confirm" role="group" aria-label="Confirm delete">
            Delete this {noun(q)} for good?
            <button type="button" className="btn adm-danger" disabled={busy} onClick={onDelete}>
              Delete {noun(q)}
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
            aria-label={`Delete ${q.name}’s ${noun(q)}`}
          >
            Delete…
          </button>
        )}
      </div>
    </li>
  );
}
