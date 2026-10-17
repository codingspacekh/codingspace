import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { api } from '@/lib/admin-api';
import type { Dashboard as Data, PostKind } from '@/lib/admin-posts';
import { ActivityList } from './activity-log';
import { shortDate, StatusBadge, subjectName } from './posts-browser';

const STATS = [
  { key: 'published', label: 'Published', href: '/admin/posts?status=published' },
  { key: 'drafts', label: 'Drafts', href: '/admin/posts?status=draft' },
  { key: 'scheduled', label: 'Scheduled', href: '/admin/posts?status=scheduled' },
  { key: 'life', label: 'Life posts', href: '/admin/posts?kind=life' },
] as const;

/** 03 ADM-02: counts, recent posts, quick actions; ADM-15: the latest admin activity. */
export function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Data>('/api/admin/dashboard').then(({ status, data }) => {
      if (status === 200) setData(data);
      else setError('The dashboard could not be loaded. Reload the page to try again.');
    });
  }, []);

  async function create(kind: PostKind) {
    setBusy(true);
    const { status, data } = await api<{ id?: string }>('/api/admin/posts', {
      method: 'POST',
      body: kind === 'lesson' ? { kind, subject_id: 'math' } : { kind },
    });
    if (status === 201 && data.id) await router.push(`/admin/posts/${data.id}`);
    else {
      setError('The new post could not be created. Try again.');
      setBusy(false);
    }
  }

  return (
    <>
      <div className="adm-head">
        <h1>Dashboard</h1>
        <div className="adm-quick">
          <button type="button" className="btn pri" disabled={busy} onClick={() => create('lesson')}>
            New lesson
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => create('life')}>
            New life post
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="adm-error">
          {error}
        </p>
      )}
      {!data ? (
        !error && <p aria-live="polite">Loading…</p>
      ) : (
        <>
          <ul className="adm-stats">
            {STATS.map((s) => (
              <li key={s.key}>
                <Link href={s.href} className="frame">
                  <strong>{data.counts[s.key]}</strong> <span>{s.label}</span>
                </Link>
              </li>
            ))}
          </ul>
          <h2>Recently edited</h2>
          {data.recent.length === 0 ? (
            <p className="empty">Nothing yet. Start with “New lesson”.</p>
          ) : (
            <ul className="adm-recent">
              {data.recent.map((p) => (
                <li key={p.id}>
                  <Link href={`/admin/posts/${p.id}`}>{p.title || 'Untitled'}</Link>
                  <span className="meta">
                    {p.kind === 'lesson' ? subjectName(p.subject_id) : 'Life'} · {shortDate(p.updated_at)}
                  </span>
                  <StatusBadge post={p} />
                </li>
              ))}
            </ul>
          )}
          <p>
            <Link href="/admin/posts">All posts →</Link>
          </p>
          <h2>Recent activity</h2>
          {data.activity.length === 0 ? (
            <p className="empty">No changes yet.</p>
          ) : (
            <ActivityList events={data.activity} />
          )}
          <p>
            <Link href="/admin/activity">All activity →</Link>
          </p>
          <h2>Backup</h2>
          <p className="meta">
            Every post (as Markdown and JSON), section, project, problem and the Author page, in one .zip file. Uploaded
            images and files stay in storage.
          </p>
          <p>
            <a className="btn" href="/api/admin/export" download>
              Download all content
            </a>
          </p>
        </>
      )}
    </>
  );
}
