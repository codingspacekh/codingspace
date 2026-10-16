import Link from 'next/link';
import { formatDate, levelLabel } from '@/lib/format';
import { SUBJECTS, type SubjectId } from '@/lib/subjects';
import type { PostCard, Project } from '@/server/data/types';

const color = (subject: SubjectId | null) => (subject ? `c-${SUBJECTS[subject].color}` : 'c-pink');

export function SubjectTrack({ subject, lessons }: { subject: SubjectId; lessons: number }) {
  const s = SUBJECTS[subject];
  return (
    <Link href={`/study/${subject}`} className={`frame track ${color(subject)}`}>
      <span className="g" aria-hidden="true">
        {s.glyph}
      </span>
      <h3>{s.name}</h3>
      <p>{s.blurb}</p>
      <span className="meta">
        {lessons} lesson{lessons === 1 ? '' : 's'}
      </span>
    </Link>
  );
}

export function PostTile({ post }: { post: PostCard }) {
  const s = post.subject ? SUBJECTS[post.subject] : null;
  return (
    <Link href={`/posts/${post.slug}`} className={`frame post ${color(post.subject)}`} lang={post.lang}>
      <div className="cover" aria-hidden="true">
        <b>{s?.glyph ?? '✦'}</b>
      </div>
      <div className="body">
        <span className="tag">{s?.name ?? 'Life'}</span>
        <h3>{post.title}</h3>
        {post.summary && <p>{post.summary}</p>}
        <span className="meta">
          {formatDate(post.publishedAt)} · {post.minutes} min read
        </span>
      </div>
    </Link>
  );
}

export function LessonRow({ lesson }: { lesson: PostCard }) {
  return (
    <Link href={`/posts/${lesson.slug}`} className="frame lesson" lang={lesson.lang}>
      <span className="row">
        <strong>{lesson.title}</strong>
        <span className="lvl">
          <i>{'▮'.repeat(lesson.level)}</i>
          {'▯'.repeat(3 - lesson.level)} {levelLabel(lesson.level)}
        </span>
      </span>
      {lesson.summary && <span className="sum">{lesson.summary}</span>}
      <span className="meta">{lesson.minutes} min read</span>
    </Link>
  );
}

export function ProjectCard({ project }: { project: Project }) {
  return (
    <a
      href={project.landingUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`frame proj ${color(project.subject)}`}
    >
      <span className="ico" aria-hidden="true">
        {project.glyph || '◆'}
      </span>
      <span className="info">
        <span className="stack">
          <strong className="proj-name">{project.name}</strong>
          {project.tag && <span className="tag">{project.tag}</span>}
        </span>
        <span className="desc">{project.description}</span>
        {project.platforms.length > 0 && <span className="meta">{project.platforms.join(' · ')}</span>}
        <span className="more">
          Visit site ↗<span className="sr-only"> (opens in a new tab)</span>
        </span>
      </span>
    </a>
  );
}
