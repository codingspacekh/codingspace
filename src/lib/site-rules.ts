/**
 * Rules for the site-content forms (03 ADM-11, ADM-13, ADM-14), shared by the admin (instant
 * feedback) and the server. No zod: this file is part of the admin's browser bundle.
 */

/** A project's landing page: https only, a real host, no user:password@ (03 ADM-13). */
export function landingUrlProblem(value: string): string | null {
  const v = value.trim();
  if (!v) return 'A landing page address is required.';
  if ([...v].some((c) => c.codePointAt(0)! <= 0x20)) return 'The address can’t contain spaces.';
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return 'That isn’t a web address. It should start with https://';
  }
  if (url.protocol !== 'https:') return 'The address must start with https:// (secure pages only).';
  if (url.username || url.password) return 'The address can’t contain a user name or password.';
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(url.hostname) || !url.hostname.includes('.')) {
    return 'The address needs a real domain, like https://example.com.';
  }
  if (v.length > 500) return 'The address is too long.';
  return null;
}

/** Monday of the week a date falls in (YYYY-MM-DD), for "Week of …" (03 ADM-11). */
export function mondayOf(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
