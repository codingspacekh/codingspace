import Head from 'next/head';
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent, type MouseEvent } from 'react';
import { formatDate } from '@/lib/format';
import type { LessonQuestion, QuestionsPage } from '@/server/data/types';

/** What the section says: questions under a lesson, comments under a life post (same rules). */
const WORDS = {
  lesson: {
    anchor: 'questions',
    heading: 'Questions',
    noun: 'questions',
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
    noun: 'comments',
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

/** The approved questions (comments) with the teacher's answers; also used by the older-ones page. */
export function QuestionList({ questions }: { questions: LessonQuestion[] }) {
  return (
    <ol className="q-list">
      {questions.map((q) => (
        // tabIndex: after "Show older", focus moves to the first newly shown one.
        <li key={q.id} className="frame" data-q={q.id} tabIndex={-1}>
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
  );
}

/** The way to the next older page: a plain link (its own page) that loads in place with JavaScript. */
export const olderHref = (slug: string, questions: LessonQuestion[]) =>
  `/posts/${slug}/older?before=${encodeURIComponent(questions[questions.length - 1]!.publishedAt)}`;

export const olderLabel = (kind: 'lesson' | 'life', more: number) => `Show older ${WORDS[kind].noun} (${more} more)`;

/**
 * Questions under a lesson, or comments under a life post (v1.1): the approved ones with the
 * teacher's answers, newest first, 20 at a time ("Show older" for the rest), and a form. No login;
 * every one waits for the teacher. A plain form post without JavaScript.
 */
export function LessonQuestions({
  slug,
  kind = 'lesson',
  questions,
  more = 0,
}: {
  slug: string;
  kind?: 'lesson' | 'life';
  questions: LessonQuestion[];
  /** How many older ones there are beyond `questions`. */
  more?: number;
}) {
  const id = useId();
  const w = WORDS[kind];
  const MESSAGES = w.messages;
  const asked = useAsked();
  const [older, setOlder] = useState<LessonQuestion[]>([]);
  const [left, setLeft] = useState(more);
  const [loading, setLoading] = useState(false);
  const [olderFailed, setOlderFailed] = useState(false);
  const shown = older.length ? [...questions, ...older] : questions;
  const list = useRef<HTMLDivElement>(null);
  const [focusId, setFocusId] = useState('');

  useEffect(() => {
    if (focusId) list.current?.querySelector<HTMLElement>(`[data-q="${focusId}"]`)?.focus();
  }, [focusId]);

  async function showOlder(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    const before = shown[shown.length - 1]!.publishedAt;
    const page = await fetch(`/api/questions?post=${slug}&before=${encodeURIComponent(before)}`)
      .then((r) => (r.ok ? (r.json() as Promise<QuestionsPage>) : null))
      .catch(() => null);
    setLoading(false);
    setOlderFailed(!page);
    if (!page) return;
    setOlder((o) => [...o, ...page.questions]);
    setLeft(page.more);
    if (page.questions[0]) setFocusId(page.questions[0].id);
  }
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
      {/* The post page loads KaTeX CSS for the first page only; older ones may bring maths. */}
      {older.some((q) => q.hasMath) && (
        <Head>
          <link rel="stylesheet" href="/katex/katex.min.css" />
        </Head>
      )}
      <div ref={list}>{shown.length > 0 ? <QuestionList questions={shown} /> : <p className="meta">{w.none}</p>}</div>
      {left > 0 && (
        <p className="q-more">
          <a className="btn" href={olderHref(slug, shown)} onClick={showOlder} aria-disabled={loading || undefined}>
            {loading ? 'Loading…' : olderLabel(kind, left)}
          </a>
        </p>
      )}
      {olderFailed && (
        <p className="q-result" role="alert">
          The older {w.noun} could not be loaded. Please try again.
        </p>
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
