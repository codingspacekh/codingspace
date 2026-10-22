import Link from 'next/link';
import { formatDate, levelLabel } from '@/lib/format';
import { useSubjects, type Subject } from '@/lib/subjects';
import type { PostCard, Project } from '@/server/data/types';
import { DoneTick } from './progress';

const color = (subject: Subject | undefined) => (subject ? `c-${subject.color}` : 'c-pink');

export function SubjectTrack({ subject: s, lessons }: { subject: Subject; lessons: number }) {
  return (
    <Link href={`/study/${s.id}`} className={`track ${color(s)}`}>
      <span className="g" aria-hidden="true">
        {s.glyph}
      </span>
      <h3>{s.name}</h3>
      <p>{s.blurb}</p>
      <span className="track-count">
        {lessons > 0 ? `${lessons} lesson${lessons === 1 ? '' : 's'}` : 'No lessons yet'}
      </span>
    </Link>
  );
}

export function PostTile({ post, featured = false }: { post: PostCard; featured?: boolean }) {
  const s = useSubjects().subject(post.subject);
  return (
    <Link href={`/posts/${post.slug}`} className={`post ${featured ? 'post-big ' : ''}${color(s)}`} lang={post.lang}>
      <div className="cover" aria-hidden="true">
        <b>{s?.glyph ?? '✦'}</b>
      </div>
      <div className="body">
        <span className="post-subject">{s?.name ?? 'Life'}</span>
        <h3>{post.title}</h3>
        {post.summary && <p>{post.summary}</p>}
        <span className="post-meta">
          {formatDate(post.publishedAt)} · {post.minutes} min read
        </span>
      </div>
    </Link>
  );
}

/** One line in the list beside the newest lesson on Home. */
export function PostLine({ post }: { post: PostCard }) {
  const s = useSubjects().subject(post.subject);
  return (
    <Link href={`/posts/${post.slug}`} className={`post-line ${color(s)}`} lang={post.lang}>
      <span className="g" aria-hidden="true">
        {s?.glyph ?? '✦'}
      </span>
      <span className="txt">
        <strong>{post.title}</strong>
        <span className="post-meta">
          {s?.name ?? 'Life'} · {formatDate(post.publishedAt)} · {post.minutes} min read
        </span>
      </span>
    </Link>
  );
}

/** Home's latest lessons: the newest one large, the rest as a list beside it. */
export function LatestLessons({ posts }: { posts: PostCard[] }) {
  const [first, ...rest] = posts;
  if (!first) return null;
  return (
    <div className={`latest${rest.length ? '' : ' solo'}`}>
      <PostTile post={first} featured />
      {rest.length > 0 && (
        <ul className="latest-list">
          {rest.map((p) => (
            <li key={p.slug}>
              <PostLine post={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LessonRow({ lesson }: { lesson: PostCard }) {
  return (
    <Link href={`/posts/${lesson.slug}`} className="frame lesson" lang={lesson.lang}>
      <span className="row">
        <strong>
          {lesson.title}
          <DoneTick slug={lesson.slug} />
        </strong>
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
    <Link href={`/projects/${project.slug}`} className={`proj ${color(s)}`}>
      <span className="ico" aria-hidden="true">
        {project.glyph || '◆'}
      </span>
      <span className="info">
        <span className="stack">
          <strong className="proj-name">{project.name}</strong>
          {project.tag && <span className="tag">{project.tag}</span>}
          {project.comingSoon && <span className="tag tag-soon">Coming soon</span>}
        </span>
        <span className="desc">{project.description}</span>
        {project.platforms.length > 0 && <span className="post-meta">{project.platforms.join(' · ')}</span>}
        <span className="proj-more">{project.available ? 'Details and download' : 'See the project'}</span>
      </span>
    </Link>
  );
}
