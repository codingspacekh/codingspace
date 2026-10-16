import { useEffect, useId, useState, type FormEvent } from 'react';
import { api } from '@/lib/admin-api';
import { moveItem } from '@/lib/post-rules';
import { EMAIL } from '@/lib/site-rules';

type Profile = { name: string; bio: string; years: number | null; students: number | null; email: string };
type Item = { key: number; year: string; text: string };
type Loaded = { profile: Profile; timeline: { year: number; text: string }[] };

let nextKey = 0;
const item = (year: string | number, text: string): Item => ({ key: ++nextKey, year: String(year), text });

const count = (v: string): number | null => (v.trim() === '' ? null : Number(v));

/** What stops saving, if anything: the server checks the same (03 ADM-14). */
function problemOf(p: Profile, years: string, students: string, items: Item[]): string | null {
  if (!p.name.trim()) return 'Add your name.';
  if (p.email.trim() && !EMAIL.test(p.email.trim())) return 'The email address doesn’t look right.';
  for (const [label, v, max] of [
    ['Years teaching', years, 100],
    ['Students taught', students, 1_000_000],
  ] as const) {
    const n = count(v);
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > max))
      return `${label} must be a whole number from 0 to ${max}.`;
  }
  for (const [i, t] of items.entries()) {
    const y = Number(t.year);
    if (!Number.isInteger(y) || y < 1900 || y > 2200) return `Timeline entry ${i + 1}: the year must be like 2024.`;
    if (!t.text.trim()) return `Timeline entry ${i + 1}: write what happened, or remove the entry.`;
  }
  return null;
}

/**
 * 03 ADM-14: the Author page — name, bio, stats, public email, and the timeline (in the
 * order shown). One Save writes it all and rebuilds the page.
 */
export function AuthorAdmin() {
  const id = useId();
  const [loaded, setLoaded] = useState<'loading' | 'failed' | 'ok'>('loading');
  const [profile, setProfile] = useState<Profile>({ name: '', bio: '', years: null, students: null, email: '' });
  const [years, setYears] = useState('');
  const [students, setStudents] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    void api<Loaded>('/api/admin/author').then(({ status, data }) => {
      if (status !== 200) return setLoaded('failed');
      setProfile(data.profile);
      setYears(data.profile.years == null ? '' : String(data.profile.years));
      setStudents(data.profile.students == null ? '' : String(data.profile.students));
      setItems(data.timeline.map((t) => item(t.year, t.text)));
      setLoaded('ok');
    });
  }, []);

  const problem = problemOf(profile, years, students, items);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setProfile((p) => ({ ...p, [k]: v }));
  const setItem = (key: number, patch: Partial<Item>) =>
    setItems((list) => list.map((t) => (t.key === key ? { ...t, ...patch } : t)));

  async function save(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (problem) return;
    setBusy(true);
    const { status, data } = await api<{ error?: string; failed?: string[] }>('/api/admin/author', {
      method: 'PUT',
      body: {
        profile: { ...profile, years: count(years), students: count(students) },
        timeline: items.map((t) => ({ year: Number(t.year), text: t.text })),
      },
    }).catch(() => ({ status: 0, data: {} as { error?: string; failed?: string[] } }));
    setBusy(false);
    setMessage(
      status === 200
        ? data.failed?.length
          ? 'Saved. The Author page will catch up within 5 minutes.'
          : 'Saved. The Author page is updated.'
        : `Not saved: ${data.error ?? 'try again'}.`,
    );
  }

  if (loaded === 'loading') return <p aria-live="polite">Loading…</p>;
  if (loaded === 'failed')
    return (
      <p role="alert" className="adm-error">
        The profile could not be loaded. Reload the page to try again.
      </p>
    );

  return (
    <form className="adm-form adm-author" onSubmit={save} aria-label="Author page" noValidate>
      <h1>Author page</h1>
      <label>
        Name
        <input value={profile.name} maxLength={80} required onChange={(e) => set('name', e.target.value)} />
      </label>
      <label>
        About you
        <textarea rows={5} maxLength={2000} value={profile.bio} onChange={(e) => set('bio', e.target.value)} />
      </label>
      <div className="adm-row">
        <label>
          Years teaching
          <input inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value)} />
        </label>
        <label>
          Students taught
          <input inputMode="numeric" value={students} onChange={(e) => setStudents(e.target.value)} />
        </label>
      </div>
      <label>
        Public email (shown on the page; leave empty to hide)
        <input type="email" value={profile.email} maxLength={200} onChange={(e) => set('email', e.target.value)} />
      </label>

      <fieldset className="adm-timeline">
        <legend>Timeline (shown in this order)</legend>
        {items.length === 0 && <p className="meta">No entries yet.</p>}
        <ol>
          {items.map((t, i) => (
            <li key={t.key}>
              <label>
                Year
                <input
                  inputMode="numeric"
                  className="adm-year"
                  value={t.year}
                  maxLength={4}
                  aria-label={`Year of entry ${i + 1}`}
                  onChange={(e) => setItem(t.key, { year: e.target.value })}
                />
              </label>
              <label className="adm-grow">
                What happened
                <input
                  value={t.text}
                  maxLength={300}
                  aria-label={`What happened, entry ${i + 1}`}
                  onChange={(e) => setItem(t.key, { text: e.target.value })}
                />
              </label>
              <span className="adm-quick">
                <button
                  type="button"
                  className="btn"
                  disabled={i === 0}
                  aria-label={`Move entry ${i + 1} up`}
                  onClick={() => setItems((list) => moveItem(list, i, -1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={i === items.length - 1}
                  aria-label={`Move entry ${i + 1} down`}
                  onClick={() => setItems((list) => moveItem(list, i, 1))}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn"
                  aria-label={`Remove entry ${i + 1}`}
                  onClick={() => setItems((list) => list.filter((x) => x.key !== t.key))}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="btn"
          disabled={items.length >= 50}
          onClick={() => setItems((list) => [...list, item(new Date().getFullYear(), '')])}
        >
          Add an entry
        </button>
      </fieldset>

      {touched && problem && (
        <p role="alert" className="adm-error" id={`${id}-problem`}>
          {problem}
        </p>
      )}
      <div className="adm-quick">
        <button type="submit" className="btn pri" disabled={busy}>
          Save
        </button>
        <a className="btn" href="/author" target="_blank" rel="noopener">
          View the Author page
        </a>
      </div>
      <p className="adm-live" role="status">
        {message}
      </p>
    </form>
  );
}
