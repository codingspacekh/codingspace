import type { IncomingMessage } from 'node:http';
import { serviceClient } from '@/server/admin/cron';
import { clientIp, rateKey } from '@/server/data/search';

/**
 * Sign-in throttling per visitor (code review 2026-10-18). Supabase Auth sees every sign-in from
 * the server's address, so its own per-address limits are shared by everyone. Here each visitor's
 * failed attempts (wrong password or wrong code) are counted, keyed by a salted hash of their
 * address, and a visitor with too many recent failures is paused before Supabase is asked at all.
 * Successful sign-ins never count. The counts are reachable only with the service role.
 *
 * If the count can't be read or written, sign-in goes on: Supabase's own limits still apply, and a
 * broken counter must not lock the owner out.
 */

/** Wrong passwords and codes allowed per visitor in WINDOW_MINUTES. */
export const MAX_FAILURES = 10;
export const WINDOW_MINUTES = 15;

const key = (req: Pick<IncomingMessage, 'headers' | 'socket'>) =>
  rateKey(clientIp(req), new Date(), process.env.AUTH_SALT ?? process.env.SEARCH_SALT ?? 'codingspace-auth');

/** True when this visitor has failed too often lately and should wait. */
export async function tooManyFailures(req: Pick<IncomingMessage, 'headers' | 'socket'>): Promise<boolean> {
  try {
    const { data, error } = await serviceClient().rpc('auth_failures_recent', {
      p_key: key(req),
      p_minutes: WINDOW_MINUTES,
    });
    if (error) throw new Error(error.message);
    return (data as number) >= MAX_FAILURES;
  } catch (e) {
    console.error('auth_failures_recent', e instanceof Error ? e.message : e);
    return false;
  }
}

/** Counts one wrong password or code against this visitor. */
export async function recordFailure(req: Pick<IncomingMessage, 'headers' | 'socket'>): Promise<void> {
  try {
    const { error } = await serviceClient().rpc('auth_record_failure', { p_key: key(req) });
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error('auth_record_failure', e instanceof Error ? e.message : e);
  }
}

/** The answer to a paused visitor: 429, with when to try again. */
export const RETRY_AFTER_SECONDS = String(WINDOW_MINUTES * 60);
