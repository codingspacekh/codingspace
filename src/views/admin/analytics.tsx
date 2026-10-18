import { useEffect, useState } from 'react';
import { api } from '@/lib/admin-api';
import {
  averageSeconds,
  change,
  countryName,
  DEVICE_LABELS,
  formatDuration,
  pageLabel,
  RANGES,
  sumDays,
  type Analytics,
  type AnalyticsDay,
  type Range,
} from '@/lib/analytics';
import { useSubjects } from '@/lib/subjects';

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayLabel = (iso: string) => DAY.format(new Date(`${iso}T00:00:00Z`));
const monthLabel = (ym: string) => MONTH.format(new Date(`${ym}-01T00:00:00Z`));
const n = (v: number) => v.toLocaleString('en-GB');

function Stat({ label, value, now, before }: { label: string; value: string; now: number; before: number }) {
  const diff = change(now, before);
  return (
    <li className="frame">
      <strong>{value}</strong> <span>{label}</span>
      {diff && <span className="meta">{diff} on the period before</span>}
    </li>
  );
}

/** Visitors per day as bars; the same numbers are in a table for screen readers. */
function DailyChart({ days }: { days: AnalyticsDay[] }) {
  const max = Math.max(1, ...days.map((d) => d.visitors));
  const ticks = new Set([0, Math.floor((days.length - 1) / 2), days.length - 1]);
  return (
    <figure className="ana-chart">
      <figcaption>Visitors per day</figcaption>
      <div className="ana-bars" aria-hidden="true">
        {days.map((d, i) => (
          <div
            key={d.day}
            className="ana-bar"
            data-tip={`${dayLabel(d.day)}: ${n(d.visitors)} visitor${d.visitors === 1 ? '' : 's'}, ${n(d.views)} page view${d.views === 1 ? '' : 's'}`}
          >
            <span style={{ height: `${(d.visitors / max) * 100}%` }} />
            {ticks.has(i) && <small>{dayLabel(d.day)}</small>}
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>Visitors and page views per day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Visitors</th>
            <th scope="col">Page views</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <th scope="row">{dayLabel(d.day)}</th>
              <td>{d.visitors}</td>
              <td>{d.views}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** A ranked list with a bar for each share of the page views. */
function Breakdown({ title, rows, empty }: { title: string; rows: { label: string; views: number }[]; empty: string }) {
  const total = rows.reduce((t, r) => t + r.views, 0);
  return (
    <section className="ana-box" aria-label={title}>
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <ul className="ana-list">
          {rows.map((r) => (
            <li key={r.label}>
              <span className="ana-label">{r.label}</span>
              <span className="ana-num">{n(r.views)}</span>
              <span className="ana-share" aria-hidden="true">
                <span style={{ width: `${total ? (r.views / total) * 100 : 0}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * v1.1 owner analytics: how much the site is used. Visitors, page views and reading time for
 * the last 7, 30 or 90 days; the most read pages and subjects; where visitors come from; their
 * devices and countries; and visitors per month for the past year. Cookie-less (NFR-PRIV-1).
 */
export function AnalyticsDashboard() {
  const { subject } = useSubjects();
  const subjectName = (id: string) => subject(id)?.name ?? id;
  const [range, setRange] = useState<Range>(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stale = false;
    api<Analytics>(`/api/admin/analytics?days=${range}`).then(({ status, data }) => {
      if (stale) return;
      if (status === 200) {
        setError('');
        setData(data);
      } else setError('The analytics could not be loaded. Reload the page to try again.');
    });
    return () => {
      stale = true;
    };
  }, [range]);

  const totals = data ? sumDays(data.days) : null;

  return (
    <>
      <div className="adm-head">
        <h1>Analytics</h1>
        <div className="adm-quick" role="group" aria-label="Period">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              className={`btn${r === range ? ' pri' : ''}`}
              aria-pressed={r === range}
              onClick={() => setRange(r)}
            >
              Last {r} days
            </button>
          ))}
        </div>
      </div>
      <p className="meta">
        Counted without cookies: a visitor is recognised for one day only, and no address is stored. Your own visits
        while signed in, the admin and search engines’ robots are left out. Days run on Cambodian time.
      </p>
      {error && (
        <p role="alert" className="adm-error">
          {error}
        </p>
      )}
      {!data || !totals ? (
        !error && <p aria-live="polite">Loading…</p>
      ) : (
        <>
          <ul className="adm-stats ana-stats" aria-label="Totals">
            <Stat label="Visitors" value={n(totals.visitors)} now={totals.visitors} before={data.previous.visitors} />
            <Stat label="Page views" value={n(totals.views)} now={totals.views} before={data.previous.views} />
            <Stat
              label="Average time on a page"
              value={formatDuration(averageSeconds(totals))}
              now={averageSeconds(totals)}
              before={averageSeconds(data.previous)}
            />
            <Stat
              label="Pages per visitor"
              value={totals.visitors ? (totals.views / totals.visitors).toFixed(1) : '—'}
              now={totals.visitors ? totals.views / totals.visitors : 0}
              before={data.previous.visitors ? data.previous.views / data.previous.visitors : 0}
            />
          </ul>
          <DailyChart days={data.days} />

          <h2>Most read</h2>
          {data.pages.length === 0 ? (
            <p className="empty">No visits in this period yet.</p>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th scope="col">Page</th>
                    <th scope="col">Views</th>
                    <th scope="col">Visitors</th>
                    <th scope="col">Average time</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pages.map((p) => (
                    <tr key={p.path}>
                      <th scope="row">
                        <a href={p.path} target="_blank" rel="noopener">
                          {pageLabel(p.path, p.title, (id) => subject(id)?.name)}
                        </a>
                        <span className="adm-slug">
                          {p.path}
                          {p.subject ? ` · ${subjectName(p.subject)}` : ''}
                        </span>
                      </th>
                      <td>{n(p.views)}</td>
                      <td>{n(p.visitors)}</td>
                      <td>{formatDuration(averageSeconds(p))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="ana-grid">
            <Breakdown
              title="Subjects"
              empty="No lessons or subject pages read yet."
              rows={data.subjects.map((s) => ({ label: subjectName(s.subject), views: s.views }))}
            />
            <Breakdown
              title="Where visitors come from"
              empty="No visits yet."
              rows={data.sources.map((s) => ({ label: s.source ?? 'Direct or unknown', views: s.views }))}
            />
            <Breakdown
              title="Devices"
              empty="No visits yet."
              rows={data.devices.map((d) => ({ label: DEVICE_LABELS[d.device] ?? d.device, views: d.views }))}
            />
            <Breakdown
              title="Countries"
              empty="No visits yet."
              rows={data.countries.map((c) => ({ label: countryName(c.country), views: c.views }))}
            />
          </div>

          <h2>By month</h2>
          {data.months.length === 0 ? (
            <p className="empty">No visits yet.</p>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col">Visitors</th>
                    <th scope="col">Page views</th>
                  </tr>
                </thead>
                <tbody>
                  {data.months.map((m) => (
                    <tr key={m.month}>
                      <th scope="row">{monthLabel(m.month)}</th>
                      <td>{n(m.visitors)}</td>
                      <td>{n(m.views)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="meta">
            Visitors add up each day’s visitors, so someone who comes back on three days counts three times. Page views
            are kept for 90 days; the months keep their totals after that.
          </p>
        </>
      )}
    </>
  );
}
