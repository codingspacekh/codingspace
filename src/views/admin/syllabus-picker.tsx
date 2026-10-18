import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/admin-api';

type Choice = { id: string; code: string; title: string; points: { id: string; code: string; title: string }[] };
type Loaded = { syllabuses: Choice[]; point_ids: string[] };

/**
 * v1.1: the syllabus points a lesson covers, in the editor's Settings. Saved at once (not with
 * the draft): the lesson page and the syllabus pages update as soon as the lesson is live.
 */
export function SyllabusPicker({ postId }: { postId: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api<Loaded>(`/api/admin/posts/${postId}/syllabus`).then(({ status, data: d }) => {
      if (!alive) return;
      if (status !== 200) return setFailed(true);
      setData(d);
      setPicked(d.point_ids);
    });
    return () => {
      alive = false;
    };
  }, [postId]);

  async function toggle(id: string, label: string, on: boolean) {
    const next = on ? [...picked, id] : picked.filter((p) => p !== id);
    const before = picked;
    setPicked(next);
    setBusy(true);
    const { status, data: reply } = await api<{ error?: string }>(`/api/admin/posts/${postId}/syllabus`, {
      method: 'PUT',
      body: { point_ids: next },
    }).catch(() => ({ status: 0, data: {} as { error?: string } }));
    setBusy(false);
    if (status === 200) setNote(on ? `Tagged with ${label}.` : `Removed ${label}.`);
    else {
      setPicked(before);
      setNote(`Not saved: ${reply.error ?? 'try again'}.`);
    }
  }

  if (failed) return <p className="adm-error">The syllabus points could not be loaded.</p>;
  if (!data) return null;
  return (
    <fieldset className="adm-fieldset adm-syl-pick">
      <legend>Syllabus points</legend>
      {data.syllabuses.every((s) => !s.points.length) ? (
        <p className="adm-hint">
          No syllabus points yet. Add a syllabus and its points in <Link href="/admin/syllabus">Syllabus</Link>.
        </p>
      ) : (
        <>
          <p className="adm-hint">Saved at once. The lesson shows them once it is live.</p>
          {data.syllabuses
            .filter((s) => s.points.length)
            .map((s) => {
              const mine = s.points.filter((p) => picked.includes(p.id)).length;
              return (
                <details key={s.id} open={mine > 0}>
                  <summary>
                    {s.title} <span className="meta">{mine ? `${mine} chosen` : ''}</span>
                  </summary>
                  <ul>
                    {s.points.map((p) => (
                      <li key={p.id}>
                        <label className="adm-inline">
                          <input
                            type="checkbox"
                            checked={picked.includes(p.id)}
                            disabled={busy}
                            onChange={(e) => void toggle(p.id, `${s.code} ${p.code}`, e.target.checked)}
                          />
                          {p.code} {p.title}
                        </label>
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
        </>
      )}
      {/* Announced, but not a second "status": the editor's own save status is that. */}
      <p className="adm-live" aria-live="polite">
        {note}
      </p>
    </fieldset>
  );
}
