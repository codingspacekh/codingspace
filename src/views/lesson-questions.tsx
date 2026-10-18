import { useId, useState, useSyncExternalStore, type FormEvent } from 'react';
import { formatDate } from '@/lib/format';
import type { LessonQuestion } from '@/server/data/types';

/** What the section says: questions under a lesson, comments under a life post (same rules). */
const WORDS = {
  lesson: {
    anchor: 'questions',
    heading: 'Questions',
    none: 'No questions yet. Ask the first one.',
    form: 'Ask a question',
    field: 'Your question',
    send: 'Send question',
    messages: {
      ok: 'Thank you! Your question will appear here once the teacher has read it.',
      limited: 'You’ve asked a lot of questions in the last hour. Please try again later.',
      not_found: 'This lesson can’t take questions right now.',
      invalid: 'Please write your name and your question.',
      error: 'Something went wrong. Please try again in a minute.',
    } as Record<string, string>,
  },
  life: {
    anchor: 'comments',
    heading: 'Comments',
    none: 'No comments yet. Be the first.',
    form: 'Leave a comment',
    field: 'Your comment',
    send: 'Send comment',
    messages: {
      ok: 'Thank you! Your comment will appear here once the teacher has read it.',
      limited: 'You’ve sent a lot of comments in the last hour. Please try again later.',
      not_found: 'This post can’t take comments right now.',
      invalid: 'Please write your name and your comment.',
      error: 'Something went wrong. Please try again in a minute.',
    } as Record<string, string>,
  },
};

const noop = () => () => {};
/** After a form post without JavaScript, the page comes back with ?asked=<result> ('' on the server). */
const useAsked = () =>
  useSyncExternalStore(
    noop,
    () => new URLSearchParams(window.location.search).get('asked') ?? '',
    () => '',
  );

/**
 * Questions under a lesson, or comments under a life post (v1.1): the approved ones with the
 * teacher's answers, and a form. No login; every one waits for the teacher. A plain form post
 * without JavaScript.
 */
export function LessonQuestions({
  slug,
  kind = 'lesson',
  questions,
}: {
  slug: string;
  kind?: 'lesson' | 'life';
  questions: LessonQuestion[];
}) {
  const id = useId();
  const w = WORDS[kind];
  const MESSAGES = w.messages;
  const asked = useAsked();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [name, setName] = useState('');
  const [question, setQuestion] = useState('');

  async function ask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !question.trim()) return setMessage(MESSAGES.invalid!);
    const website = new FormData(e.currentTarget).get('website');
    setSending(true);
    const result = await fetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post: slug, name, question, website }),
    })
      .then((r) => r.json() as Promise<{ result?: string }>)
      .then((r) => r.result ?? 'error')
      .catch(() => 'error');
    setSending(false);
    setMessage(MESSAGES[result] ?? MESSAGES.error!);
    if (result === 'ok') setQuestion('');
  }

  return (
    <section id={w.anchor} className="questions" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{w.heading}</h2>
      {questions.length > 0 ? (
        <ol className="q-list">
          {questions.map((q) => (
            <li key={q.id} className="frame">
              <p className="meta">
                {q.name} · {formatDate(q.publishedAt)}
              </p>
              <div className="prose q-body" dangerouslySetInnerHTML={{ __html: q.bodyHtml }} />
              {q.answerHtml && (
                <div className="q-answer">
                  <span className="tag">Teacher</span>
                  <div className="prose" dangerouslySetInnerHTML={{ __html: q.answerHtml }} />
                </div>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="meta">{w.none}</p>
      )}

      <form className="q-form" method="post" action="/api/questions" onSubmit={ask} aria-labelledby={`${id}-ask`}>
        <h3 id={`${id}-ask`}>{w.form}</h3>
        <p className="q-note">
          Use your first name or a nickname, and don’t share personal details. Your{' '}
          {kind === 'life' ? 'comment' : 'question'} appears here after the teacher has read it. You can use $maths$.
        </p>
        <input type="hidden" name="post" value={slug} />
        {/* Only for the way back after a plain form post (#questions or #comments). */}
        <input type="hidden" name="kind" value={kind} />
        <label htmlFor={`${id}-name`}>Your name</label>
        <input
          id={`${id}-name`}
          name="name"
          maxLength={60}
          autoComplete="nickname"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <label htmlFor={`${id}-q`}>{w.field}</label>
        <textarea
          id={`${id}-q`}
          name="question"
          rows={4}
          maxLength={2000}
          required
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        {/* Left empty by people; bots fill it in (the question is then dropped). */}
        <div className="q-trap" aria-hidden="true">
          <label htmlFor={`${id}-w`}>Leave this empty</label>
          <input id={`${id}-w`} name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <button type="submit" className="btn pri" disabled={sending}>
          {sending ? 'Sending…' : w.send}
        </button>
        <p className="q-result" role="status">
          {message || MESSAGES[asked] || ''}
        </p>
      </form>
    </section>
  );
}
