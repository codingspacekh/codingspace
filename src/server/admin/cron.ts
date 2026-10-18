import { timingSafeEqual } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The scheduled-publish timer (03 §6.1). On the Hobby plan, Vercel Cron runs only once a day,
 * so a GitHub Actions schedule (.github/workflows/publish-due.yml) calls the endpoint every
 * 5 minutes with `Authorization: Bearer $CRON_SECRET`.
 */
export function cronAuthorized(header: string | string[] | undefined, secret = process.env.CRON_SECRET): boolean {
  // At least 32 characters: a short secret would be guessable.
  if (!secret || secret.length < 32 || typeof header !== 'string') return false;
  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Service-role client, for server code that acts without a session: the cron route and the
 * sign-in throttle (src/server/auth/throttle.ts). Never imported by pages or the browser.
 */
export function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for the cron.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
