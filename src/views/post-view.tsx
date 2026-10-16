import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { levelLabel, postMeta } from '@/lib/format';
import { neighbours } from '@/lib/lesson-nav';
import { SUBJECTS } from '@/lib/subjects';
import type { PostPageData } from '@/server/data/types';

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

export function PostView({ post, section, siblings }: PostPageData) {
  const article = useRef<HTMLElement>(null);
  useCopyButtons(article);
  const subject = post.subject ? SUBJECTS[post.subject] : null;
  const { prev, next } = neighbours(siblings, post.slug);
  const isLesson = post.kind === 'lesson' && subject;

  return (
    <div className={subject ? `c-${subject.color}` : 'c-pink'}>
      {/* KaTeX CSS and fonts load only on pages that contain maths (03 §7.6). */}
      {post.hasMath && (
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
          <div className="meta">{postMeta(post)}</div>
          {post.summary && <p className="lead">{post.summary}</p>}
          <div className="prose" dangerouslySetInnerHTML={{ __html: post.html }} />

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
        </article>

        {section && siblings.length > 0 ? (
          <aside className="rail">
            <nav aria-label={`${section.title} lessons`} className="frame">
              <span className="eyebrow">{section.title}</span>
              {siblings.map((s) => (
                <Link key={s.slug} href={`/posts/${s.slug}`} aria-current={s.slug === post.slug ? 'page' : undefined}>
                  {s.title}
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
