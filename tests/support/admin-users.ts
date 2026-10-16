import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as OTPAuth from 'otpauth';

/**
 * Test accounts for the admin (local Supabase only). The owner's id matches supabase/seed.sql,
 * which puts it on the allow-list; the other account has a password and 2FA but is not the owner.
 */
export const OWNER = {
  id: 'c0de0000-0000-4000-8000-0000000000a1',
  email: 'owner@codingspace.test',
  password: 'Owner-Test-Passw0rd!',
};
export const OTHER = {
  id: 'c0de0000-0000-4000-8000-0000000000b1',
  email: 'other@codingspace.test',
  password: 'Other-Test-Passw0rd!',
};

export function serviceClient(): SupabaseClient {
  const url = process.env.API_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Needs a local Supabase: set -a; eval "$(scripts/local-db-env.sh)"; set +a');
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`Refusing to create test users on ${url}`);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Creates the account if missing, resets its password, and removes every 2FA factor. */
export async function resetUser(admin: SupabaseClient, user: typeof OWNER): Promise<void> {
  const { data: existing } = await admin.auth.admin.getUserById(user.id);
  if (existing.user) {
    const { error } = await admin.auth.admin.updateUserById(user.id, { password: user.password });
    if (error) throw new Error(`updateUser: ${error.message}`);
    const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
    for (const f of factors?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ userId: user.id, id: f.id });
  } else {
    const { error } = await admin.auth.admin.createUser({
      id: user.id,
      email: user.email,
      password: user.password,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser: ${error.message}`);
  }
}

/**
 * The current code for a TOTP secret. `step` picks a neighbouring 30 s window, which the
 * server also accepts: use 1 for a second sign-in in the same window, as a used code may be refused.
 */
export function totp(secret: string, step = 0): string {
  return new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 }).generate({
    timestamp: Date.now() + step * 30_000,
  });
}

/** A fresh owner session with 2FA (AAL2), as the admin API routes get it. */
export async function ownerSession(): Promise<SupabaseClient> {
  const url = process.env.API_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  await resetUser(serviceClient(), OWNER);
  const supabase = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await supabase.auth.signInWithPassword({ email: OWNER.email, password: OWNER.password });
  if (error) throw new Error(`sign in: ${error.message}`);
  const { data: factor, error: enrolError } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
  if (enrolError) throw new Error(`enroll: ${enrolError.message}`);
  const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: totp(factor.totp.secret),
  });
  if (verifyError) throw new Error(`verify: ${verifyError.message}`);
  return supabase;
}
