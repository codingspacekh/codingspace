import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/admin-api';
import { describeEvent, type ActivityEvent, type ActivityPage } from '@/lib/activity';
import { useSubjects } from '@/lib/subjects';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Audit events as a list: when, then what happened, linking to the item if it still exists. */
export function ActivityList({ events }: { events: ActivityEvent[] }) {
  const { subject } = useSubjects();
  return (
    <ol className="adm-activity">
      {events.map((e) => {
        const { text, href } = describeEvent(e, (id) => subject(id)?.name);
        return (
          <li key={e.id}>
            <time dateTime={e.at} className="meta">
              {when(e.at)}
            </time>
            {href ? <Link href={href}>{text}</Link> : <span>{text}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** 03 ADM-15: the whole audit log, newest first, 50 at a time. Autosaves are left out. */
export function ActivityLog() {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function show({ status, data }: { status: number; data: ActivityPage }, older: boolean) {
    if (status !== 200) return setError('The activity could not be loaded. Try again.');
    setError('');
    setEvents((list) => [...(older ? (list ?? []) : []), ...data.events]);
    setMore(data.more);
  }

  useEffect(() => {
    api<ActivityPage>('/api/admin/activity').then((r) => show(r, false));
  }, []);

  async function older(before: number) {
    setBusy(true);
    show(await api<ActivityPage>(`/api/admin/activity?before=${before}`), true);
    setBusy(false);
  }

  return (
    <>
      <div className="adm-head">
        <h1>Activity</h1>
      </div>
      <p className="meta">Every change made in the admin, newest first. Autosaves while typing are left out.</p>
      {error && (
        <p role="alert" className="adm-error">
          {error}
        </p>
      )}
      {!events ? (
        !error && <p aria-live="polite">Loading…</p>
      ) : events.length === 0 ? (
        <p className="empty">Nothing yet.</p>
      ) : (
        <ActivityList events={events} />
      )}
      {more && events && (
        <button type="button" className="btn" disabled={busy} onClick={() => older(events.at(-1)!.id)}>
          Older
        </button>
      )}
    </>
  );
}
