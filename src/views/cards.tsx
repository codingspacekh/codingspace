import Link from 'next/link';
import { formatDate, levelLabel } from '@/lib/format';
import { useSubjects, type Subject } from '@/lib/subjects';
import type { PostCard, Project } from '@/server/data/types';

const color = (subject: Subject | undefined) => (subject ? `c-${subject.color}` : 'c-pink');

export function SubjectTrack({ subject: s, lessons }: { subject: Subject; lessons: number }) {
  return (
    <Link href={`/study/${s.id}`} className={`frame track ${color(s)}`}>
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
  const s = useSubjects().subject(post.subject);
  return (
    <Link href={`/posts/${post.slug}`} className={`frame post ${color(s)}`} lang={post.lang}>
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
  const s = useSubjects().subject(project.subject);
  return (
    <Link href={`/projects/${project.slug}`} className={`frame proj ${color(s)}`}>
      <span className="ico" aria-hidden="true">
        {project.glyph || '◆'}
      </span>
      <span className="info">
        <span className="stack">
          <strong className="proj-name">{project.name}</strong>
          {project.tag && <span className="tag">{project.tag}</span>}
          {!project.available && <span className="tag tag-soon">Coming soon</span>}
        </span>
        <span className="desc">{project.description}</span>
        {project.platforms.length > 0 && <span className="meta">{project.platforms.join(' · ')}</span>}
        <span className="more">{project.available ? 'Details and download →' : 'See the project →'}</span>
      </span>
    </Link>
  );
}
