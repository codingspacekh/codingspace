import { isSubjectId, SUBJECTS } from './subjects';

/**
 * Owner analytics (v1.1): the rules shared by the visit beacon, /api/visit and the dashboard.
 * Plain functions only: this file is also bundled for the browser (no zod here).
 */

export const DEVICES = ['mobile', 'tablet', 'desktop'] as const;
export type Device = (typeof DEVICES)[number];

export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];

const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
/** The public pages we count. The admin, error pages and anything else are never recorded. */
const TRACKED = new RegExp(`^/(?:|study/[a-z]+|posts/${SLUG}|series|series/${SLUG}|projects|author|search|saved)$`);

/** The page's path without query or hash ("/search?q=x" → "/search"), or null if it isn't counted. */
export function trackedPath(asPath: string): string | null {
  const path = asPath.split(/[?#]/)[0]!.replace(/(.)\/+$/, '$1');
  return TRACKED.test(path) ? path : null;
}

const BOT =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|curl|wget|python|java\/|go-http|axios|node-fetch|okhttp/i;
export const isBot = (ua: string) => !ua || BOT.test(ua);

export function deviceOf(ua: string): Device {
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return 'mobile';
  return 'desktop';
}

// Hosts of well-known sites (first match wins, so YouTube's app comes before Google's): "google.com.kh" and "m.facebook.com" both match.
const SOURCES: [RegExp, string][] = [
  [/^(?:[a-z0-9-]+\.)*(?:youtube\.com|youtu\.be)$|^com\.google\.android\.youtube$/, 'YouTube'],
  [/^(?:[a-z0-9-]+\.)*google\.[a-z.]+$|^com\.google\./, 'Google'],
  [/^(?:[a-z0-9-]+\.)*(?:facebook\.com|fb\.com|fb\.me|messenger\.com)$|^com\.facebook\./, 'Facebook'],
  [/^(?:[a-z0-9-]+\.)*(?:t\.me|telegram\.org|telegram\.me)$|^org\.telegram\./, 'Telegram'],
  [/^(?:[a-z0-9-]+\.)*(?:instagram\.com)$|^com\.instagram\./, 'Instagram'],
  [/^(?:[a-z0-9-]+\.)*(?:tiktok\.com)$|^com\.zhiliaoapp\./, 'TikTok'],
  [/^(?:[a-z0-9-]+\.)*(?:bing\.com)$/, 'Bing'],
  [/^(?:[a-z0-9-]+\.)*(?:duckduckgo\.com)$/, 'DuckDuckGo'],
  [/^(?:[a-z0-9-]+\.)*(?:chatgpt\.com|openai\.com)$/, 'ChatGPT'],
  [/^(?:[a-z0-9-]+\.)*(?:claude\.ai)$/, 'Claude'],
  [/^(?:[a-z0-9-]+\.)*(?:github\.com)$/, 'GitHub'],
  [/^(?:[a-z0-9-]+\.)*(?:x\.com|twitter\.com|t\.co)$/, 'X'],
  [/^(?:[a-z0-9-]+\.)*(?:linkedin\.com|lnkd\.in)$/, 'LinkedIn'],
];

/**
 * Where a visitor came from: a known site's name, else the referring host ("www." dropped).
 * Null for a direct visit, a link inside the site or anything that isn't a web or app address.
 * Only the host is kept, never the page or its query.
 */
export function sourceOf(referrer: string | undefined, ownHost: string): string | null {
  if (!referrer) return null;
  let host: string;
  try {
    const url = new URL(referrer);
    // Android apps (Facebook, Telegram…) send android-app://<package>/.
    if (url.protocol === 'android-app:') host = url.host || url.pathname.replace(/^\/+/, '').split('/')[0]!;
    else if (url.protocol === 'http:' || url.protocol === 'https:') host = url.hostname;
    else return null;
  } catch {
    return null;
  }
  host = host.toLowerCase().replace(/^www\./, '');
  const own = ownHost
    .toLowerCase()
    .split(':')[0]!
    .replace(/^www\./, '');
  if (!host || host === own || host.length > 100 || !/^[a-z0-9.-]+$/.test(host)) return null;
  return SOURCES.find(([re]) => re.test(host))?.[1] ?? host;
}

// ── The dashboard ────────────────────────────────────────────────────────

export type Totals = { views: number; visitors: number; seconds: number; timed: number };
export type AnalyticsDay = Totals & { day: string };
export type AnalyticsPage = Totals & { path: string; title: string | null; subject: string | null };
export type Analytics = {
  today: string;
  days: AnalyticsDay[];
  previous: Totals;
  months: { month: string; views: number; visitors: number }[];
  pages: AnalyticsPage[];
  subjects: { subject: string; views: number }[];
  sources: { source: string | null; views: number }[];
  devices: { device: Device; views: number }[];
  countries: { country: string | null; views: number }[];
};

export function sumDays(days: AnalyticsDay[]): Totals {
  return days.reduce(
    (t, d) => ({
      views: t.views + d.views,
      visitors: t.visitors + d.visitors,
      seconds: t.seconds + d.seconds,
      timed: t.timed + d.timed,
    }),
    { views: 0, visitors: 0, seconds: 0, timed: 0 },
  );
}

/** Average time on a page, counting only the views that reported a time. */
export const averageSeconds = (t: Pick<Totals, 'seconds' | 'timed'>) => (t.timed ? Math.round(t.seconds / t.timed) : 0);

/** "45 s", "3 min 05 s", "—" for nothing. */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '—';
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m} min ${String(s).padStart(2, '0')} s`;
}

/** Change from the previous period, as "+12 %" / "−5 %"; null when there is nothing to compare with. */
export function change(now: number, before: number): string | null {
  if (!before) return null;
  const pct = Math.round(((now - before) / before) * 100);
  return pct === 0 ? '±0 %' : `${pct > 0 ? '+' : '−'}${Math.abs(pct)} %`;
}

const FIXED_PAGES: Record<string, string> = {
  '/': 'Home',
  '/projects': 'Projects',
  '/author': 'Author',
  '/search': 'Search',
  '/saved': 'Saved lessons',
  '/series': 'Series',
};

/** A readable name for a counted page: the lesson's title, "Math (subject page)", "Home"… */
export function pageLabel(path: string, title: string | null): string {
  if (title) return title;
  if (FIXED_PAGES[path]) return FIXED_PAGES[path];
  const study = /^\/study\/([a-z]+)$/.exec(path)?.[1];
  if (study && isSubjectId(study)) return `${SUBJECTS[study].name} (subject page)`;
  return path;
}

export const subjectName = (id: string) => (isSubjectId(id) ? SUBJECTS[id].name : id);

export const DEVICE_LABELS: Record<Device, string> = { mobile: 'Phone', tablet: 'Tablet', desktop: 'Computer' };

let regions: Intl.DisplayNames | undefined;
export function countryName(code: string | null): string {
  if (!code) return 'Unknown';
  try {
    regions ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return regions.of(code) ?? code;
  } catch {
    return code;
  }
}
