import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { levelLabel, postMeta } from '@/lib/format';
import { neighbours } from '@/lib/lesson-nav';
import { useSubjects } from '@/lib/subjects';
import { pointAnchor } from '@/lib/syllabus';
import { usePractice } from './practice';
import { LessonQuestions } from './lesson-questions';
import type { PostPageData, SeriesLink, SeriesNav } from '@/server/data/types';
import { markDone, savePost, unmarkDone, unsavePost, useDone, useHydrated, usePrefs, useSaved } from '@/ui';
import { DoneTick, Progress } from './progress';

/** Copy buttons in code blocks (rendered by the server as plain <button class="code-copy">). */
function useCopyButtons(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onClick = async (e: MouseEvent) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('.code-copy');
      const code = button?.closest('figure')?.querySelector('pre');
      if (!button || !code) return;
      try {
        await navigator.clipboard.writeText(code.textContent ?? '');
        button.textContent = 'Copied';
      } catch {
        button.textContent = 'Press Ctrl+C';
      }
      window.setTimeout(() => (button.textContent = 'Copy'), 1500);
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [root]);
}

/** Printing opens every hint and solution (closed <details> don't print), then closes them again. */
function usePrintOpensDetails() {
  useEffect(() => {
    let opened: HTMLDetailsElement[] = [];
    const before = () => {
      // Practice answers stay closed: a printed lesson is a worksheet.
      opened = Array.from(document.querySelectorAll<HTMLDetailsElement>('details:not([open]):not(.practice-solution)'));
      opened.forEach((d) => (d.open = true));
    };
    const after = () => opened.forEach((d) => (d.open = false));
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
}

/** Save for later (kept in this browser only; listed on /saved). */
function SaveButton({ post }: { post: PostPageData['post'] }) {
  const saved = useSaved().some((p) => p.slug === post.slug);
  return (
    <>
      <button
        type="button"
        className="ui-toggle"
        aria-pressed={saved}
        onClick={() =>
          saved
            ? unsavePost(post.slug)
            : savePost({ slug: post.slug, title: post.title, subject: post.subject, lang: post.lang })
        }
      >
        {saved ? '★ Saved' : '☆ Save'}
      </button>
      <span className="read-saved" role="status">
        {saved && (
          <>
            Saved on this device. <Link href="/saved">Your saved lessons</Link>
          </>
        )}
      </span>
    </>
  );
}

/** 03 PUB-11: reading mode (no backdrop, glow or motion; remembered), print, and save for later. */
function ReadingTools({ post }: { post: PostPageData['post'] }) {
  const { reading, toggleReading } = usePrefs();
  return (
    <div className="read-tools">
      <button type="button" className="ui-toggle" aria-pressed={reading} onClick={toggleReading}>
        Reading mode {reading ? 'on' : 'off'}
      </button>
      <button type="button" className="ui-toggle" onClick={() => window.print()}>
        Print
      </button>
      <SaveButton post={post} />
    </div>
  );
}

/** One step along a series: the lesson's subject is shown, since a series crosses subjects. */
function SeriesStep({ lesson, dir }: { lesson: SeriesLink; dir: 'prev' | 'next' }) {
  const subject = useSubjects().subject(lesson.subject);
  return (
    <Link href={`/posts/${lesson.slug}`} className={`frame c-${subject?.color ?? 'pink'}`}>
      <span className="meta">
        {dir === 'prev' ? '← Previous' : 'Next →'}
        {subject && ` · ${subject.name}`}
      </span>{' '}
      <strong>{lesson.title}</strong>
    </Link>
  );
}

/**
 * v1.1: mark the lesson as done (kept on this device). Then points to the next lesson: in its
 * first series if it is in one, otherwise in its section.
 */
function DoneBox({ slug, next }: { slug: string; next: { slug: string; title: string } | null }) {
  const marked = Boolean(useDone()[slug]);
  const done = useHydrated() && marked;
  return (
    <section className="done-box frame" aria-label="Your progress">
      <button
        type="button"
        className={`btn${done ? '' : ' pri'}`}
        aria-pressed={done}
        onClick={() => (done ? unmarkDone(slug) : markDone(slug))}
      >
        {done ? '✓ Done' : 'Mark as done'}
      </button>
      <p role="status">
        {done ? (
          <>
            Marked as done on this device.
            {next && (
              <>
                {' '}
                Up next: <Link href={`/posts/${next.slug}`}>{next.title}</Link>
              </>
            )}
          </>
        ) : (
          'Finished this lesson? Mark it as done to track your progress (kept on this device only).'
        )}
      </p>
    </section>
  );
}

/** v1.1: "Part 3 of 7" in each series the lesson is in, with the lessons before and after it. */
function SeriesBox({ series }: { series: SeriesNav }) {
  return (
    <nav aria-label={`Series: ${series.title}`} className="series-box c-pink">
      <p className="eyebrow">
        Series · Part {series.position} of {series.total}
      </p>
      <p className="series-title">
        <Link href={`/series/${series.slug}`}>{series.title}</Link>
      </p>
      <Progress slugs={series.lessons} label={`Your progress in ${series.title}`} />
      {(series.prev || series.next) && (
        <div className="pn">
          {series.prev ? <SeriesStep lesson={series.prev} dir="prev" /> : <span />}
          {series.next && <SeriesStep lesson={series.next} dir="next" />}
        </div>
      )}
    </nav>
  );
}

export function PostView({
  post,
  section,
  siblings,
  series = [],
  syllabus = [],
  questions,
  questionsMore,
}: PostPageData) {
  const article = useRef<HTMLElement>(null);
  useCopyButtons(article);
  usePractice(article);
  usePrintOpensDetails();
  const subject = useSubjects().subject(post.subject);
  const { prev, next } = neighbours(siblings, post.slug);
  const isLesson = post.kind === 'lesson' && subject;

  return (
    <div className={subject ? `c-${subject.color}` : 'c-pink'}>
      {/* KaTeX CSS and fonts load only on pages that contain maths (03 §7.6). */}
      {(post.hasMath || questions?.some((q) => q.hasMath)) && (
        <Head>
          <link rel="stylesheet" href="/katex/katex.min.css" />
        </Head>
      )}
      <nav aria-label="Breadcrumb" className="crumbs">
        {isLesson ? (
          <>
            <span>Study</span> / <Link href={`/study/${post.subject}`}>{subject.name}</Link>
            {section && (
              <>
                {' '}
                / <Link href={`/study/${post.subject}#${section.slug}`}>{section.title}</Link>
              </>
            )}
          </>
        ) : (
          <Link href="/author">Author</Link>
        )}
      </nav>

      <div className="lay">
        {post.toc.length > 0 ? (
          <nav aria-label="On this page" className="toc frame">
            <span className="eyebrow">On this page</span>
            {post.toc.map((t) => (
              <a key={t.id} href={`#${t.id}`} className={t.level === 3 ? 'sub' : undefined} lang={post.lang}>
                {t.text}
              </a>
            ))}
          </nav>
        ) : (
          <div aria-hidden="true" />
        )}

        <article ref={article} className={`art${post.lang === 'km' ? ' km' : ''}`} lang={post.lang}>
          {isLesson && (
            <div className="stack">
              <span className="tag">{subject.name}</span>
              {section && <span className="tag">{section.title}</span>}
              <span className="tag c-lime">{levelLabel(post.level)}</span>
            </div>
          )}
          <h1>{post.title}</h1>
          <div className="meta">
            {postMeta(post)}
            {isLesson && <DoneTick slug={post.slug} />}
          </div>
          {series.map((s) => (
            <p key={s.slug} className="series-line">
              Part {s.position} of {s.total} in the series <Link href={`/series/${s.slug}`}>{s.title}</Link>
            </p>
          ))}
          {syllabus.length > 0 && (
            <p className="syl-tags">
              <span className="meta">Syllabus</span>
              {syllabus.map((t) => (
                <Link
                  key={`${t.syllabus}-${t.code}`}
                  href={`/syllabus/${t.syllabus}#${pointAnchor(t.code)}`}
                  className="tag"
                >
                  {t.syllabusCode} {t.code} {t.title}
                </Link>
              ))}
            </p>
          )}
          <ReadingTools post={post} />
          {post.summary && <p className="lead">{post.summary}</p>}
          <div className="prose" dangerouslySetInnerHTML={{ __html: post.html }} />
          {isLesson && <DoneBox slug={post.slug} next={series.find((s) => s.next)?.next ?? next ?? null} />}

          {(prev || next) && (
            <nav aria-label="More lessons in this section" className="pn">
              {prev ? (
                <Link href={`/posts/${prev.slug}`} className="frame">
                  <span className="meta">← Previous</span> <strong>{prev.title}</strong>
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link href={`/posts/${next.slug}`} className="frame">
                  <span className="meta">Next →</span> <strong>{next.title}</strong>
                </Link>
              )}
            </nav>
          )}
          {series.map((s) => (
            <SeriesBox key={s.slug} series={s} />
          ))}
          {/* The admin preview has no questions (undefined): no form there. Life posts get comments. */}
          {questions && (isLesson || post.kind === 'life') && (
            <LessonQuestions slug={post.slug} kind={post.kind} questions={questions} more={questionsMore} />
          )}
        </article>

        {section && siblings.length > 0 ? (
          <aside className="rail">
            <nav aria-label={`${section.title} lessons`} className="frame">
              <span className="eyebrow">{section.title}</span>
              {siblings.map((s) => (
                <Link key={s.slug} href={`/posts/${s.slug}`} aria-current={s.slug === post.slug ? 'page' : undefined}>
                  {s.title}
                  <DoneTick slug={s.slug} />
                </Link>
              ))}
            </nav>
          </aside>
        ) : (
          <div aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
