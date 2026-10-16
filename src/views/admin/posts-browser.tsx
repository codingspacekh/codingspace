import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '@/lib/admin-api';
import { postStatus, type PostFilters, type PostListItem } from '@/lib/admin-posts';
import { isSubjectId, SUBJECT_IDS, SUBJECTS } from '@/lib/subjects';

export const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export function StatusBadge({ post }: { post: Pick<PostListItem, 'status' | 'has_unpublished_changes'> }) {
  const label = postStatus(post);
  return <span className={`adm-status adm-status--${label.toLowerCase().replace(/\s+/g, '-')}`}>{label}</span>;
}

export const subjectName = (id: string | null) => (isSubjectId(id) ? SUBJECTS[id].name : '—');

function query(f: PostFilters) {
  const params = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
  return params.size ? `?${params}` : '';
}

/** 03 ADM-03: search, filter by type / subject / status; edit, view, delete with confirmation. */
export function PostsBrowser({ filters, onFilters }: { filters: PostFilters; onFilters: (f: PostFilters) => void }) {
  const [posts, setPosts] = useState<PostListItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const confirmRef = useRef<HTMLDivElement>(null);
  const key = query(filters);

  useEffect(() => {
    let current = true;
    api<{ posts?: PostListItem[] }>(`/api/admin/posts${key}`).then(({ status, data }) => {
      if (!current) return;
      const ok = status === 200 && !!data.posts;
      setFailed(!ok);
      if (ok) setPosts(data.posts!);
    });
    return () => {
      current = false;
    };
  }, [key]);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const pick = (name: string) => String(form.get(name) ?? '') || undefined;
    onFilters({ q: pick('q'), kind: pick('kind'), subject: pick('subject'), status: pick('status') } as PostFilters);
  }

  async function remove(post: PostListItem) {
    const { status, data } = await api<{ error?: string }>(`/api/admin/posts/${post.id}`, { method: 'DELETE' });
    setConfirming(null);
    if (status === 200) {
      setPosts((list) => list?.filter((p) => p.id !== post.id) ?? null);
      setMessage(`Deleted “${post.title || post.slug}”.`);
    } else {
      setMessage(`Could not delete “${post.title || post.slug}”: ${data.error ?? 'try again'}.`);
    }
  }

  return (
    <>
      <form className="adm-filters" role="search" onSubmit={search} key={key}>
        <label>
          Search
          <input name="q" type="search" defaultValue={filters.q ?? ''} placeholder="Title or URL" />
        </label>
        <label>
          Type
          <select name="kind" defaultValue={filters.kind ?? ''}>
            <option value="">All</option>
            <option value="lesson">Lessons</option>
            <option value="life">Life posts</option>
          </select>
        </label>
        <label>
          Subject
          <select name="subject" defaultValue={filters.subject ?? ''}>
            <option value="">All</option>
            {SUBJECT_IDS.map((s) => (
              <option key={s} value={s}>
                {SUBJECTS[s].name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={filters.status ?? ''}>
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
            <option value="changes">Unpublished changes</option>
          </select>
        </label>
        <button className="btn" type="submit">
          Apply
        </button>
      </form>

      <p className="adm-live" role="status">
        {message}
      </p>

      {failed ? (
        <p role="alert" className="adm-error">
          The posts could not be loaded. Reload the page to try again.
        </p>
      ) : !posts ? (
        <p aria-live="polite">Loading posts…</p>
      ) : posts.length === 0 ? (
        <p className="empty">No posts match these filters.</p>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <caption className="sr-only">Posts, most recently edited first</caption>
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Type</th>
                <th scope="col">Subject</th>
                <th scope="col">Status</th>
                <th scope="col">Edited</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id}>
                  <th scope="row">
                    <Link href={`/admin/posts/${p.id}`}>{p.title || <em>Untitled</em>}</Link>
                    <span className="adm-slug">/posts/{p.slug}</span>
                  </th>
                  <td>{p.kind === 'lesson' ? 'Lesson' : 'Life'}</td>
                  <td>{subjectName(p.subject_id)}</td>
                  <td>
                    <StatusBadge post={p} />
                    {p.status === 'scheduled' && <span className="adm-slug">{shortDate(p.scheduled_at)}</span>}
                  </td>
                  <td>{shortDate(p.updated_at)}</td>
                  <td className="adm-actions">
                    {confirming === p.id ? (
                      <div
                        ref={confirmRef}
                        tabIndex={-1}
                        className="adm-confirm"
                        role="group"
                        aria-label="Confirm delete"
                      >
                        <span>
                          Delete “{p.title || p.slug}”{p.status === 'published' ? ', which students can see now' : ''}?
                          This can’t be undone.
                        </span>
                        <button type="button" className="btn adm-danger" onClick={() => remove(p)}>
                          Delete permanently
                        </button>
                        <button type="button" className="btn" onClick={() => setConfirming(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <Link className="btn" href={`/admin/posts/${p.id}`} aria-label={`Edit ${p.title || p.slug}`}>
                          Edit
                        </Link>
                        {p.status === 'published' && (
                          <a
                            className="btn"
                            href={`/posts/${p.slug}`}
                            target="_blank"
                            rel="noopener"
                            aria-label={`View ${p.title || p.slug} (opens a new tab)`}
                          >
                            View
                          </a>
                        )}
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setConfirming(p.id)}
                          aria-label={`Delete ${p.title || p.slug}`}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
