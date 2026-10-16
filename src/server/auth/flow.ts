import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { sessionClaims } from './guard';

/**
 * Sign-in steps (03 ADM-01): password → TOTP (enrol once, then verify every time) → admin.
 * Pure functions over a Supabase client bound to the request, so the routes stay thin.
 */

export type SignInStep = 'password' | 'enroll' | 'verify' | 'done';

export const passwordBody = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(200),
});
export const codeBody = z.object({ code: z.string().regex(/^\d{6}$/) });
export const signOutBody = z.object({ scope: z.enum(['local', 'global']).default('local') });

/** Where the sign-in page should start for this session. */
export async function currentStep(supabase: SupabaseClient): Promise<SignInStep> {
  const claims = await sessionClaims(supabase);
  if (!claims) return 'password';
  if (claims.aal === 'aal2') return 'done';
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error(`listFactors: ${error.message}`);
  return data.totp.length > 0 ? 'verify' : 'enroll';
}

export async function signInWithPassword(
  supabase: SupabaseClient,
  body: z.infer<typeof passwordBody>,
): Promise<{ ok: true; step: SignInStep } | { ok: false; status: 401 | 429 }> {
  const { error } = await supabase.auth.signInWithPassword(body);
  // One message for unknown e-mail and wrong password; rate limits pass through.
  if (error) return { ok: false, status: error.status === 429 ? 429 : 401 };
  return { ok: true, step: await currentStep(supabase) };
}

export type Enrolment = { factorId: string; qr: string; secret: string };

/** Starts TOTP enrolment for a password-only session that has no verified factor yet. */
export async function startEnrolment(supabase: SupabaseClient): Promise<Enrolment | 'not_allowed'> {
  if ((await currentStep(supabase)) !== 'enroll') return 'not_allowed';
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) throw new Error(`listFactors: ${listError.message}`);
  // Drop abandoned attempts so they don't pile up against max_enrolled_factors.
  for (const f of factors.all) {
    if (f.factor_type === 'totp' && f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `CodingSpace ${new Date().toISOString().slice(0, 10)}`,
    issuer: 'CodingSpace',
  });
  if (error) throw new Error(`enroll: ${error.message}`);
  return {
    factorId: data.id,
    qr: qrDataUrl(data.totp.qr_code),
    secret: data.totp.secret,
  };
}

/**
 * supabase-js already returns the QR as `data:image/svg+xml;utf-8,<svg…>` (raw, unencoded SVG).
 * Re-encode the SVG so characters like `#` can't cut the URL short; accept raw SVG too.
 */
export function qrDataUrl(qr: string): string {
  const svg = qr.startsWith('data:') ? qr.slice(qr.indexOf(',') + 1) : qr;
  // GoTrue's SVG starts with an XML declaration and a comment.
  if (!/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>/]/.test(svg))
    throw new Error('enroll: unexpected QR code format');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Verifies a 6-digit code: against the verified factor, or the pending enrolment if there is none.
 * On success the session becomes AAL2 and the owner check runs at once (it also starts the idle clock).
 */
export async function verifyCode(
  supabase: SupabaseClient,
  code: string,
): Promise<'ok' | 'invalid_code' | 'unauthenticated' | 'forbidden'> {
  const step = await currentStep(supabase);
  if (step === 'password') return 'unauthenticated';
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) throw new Error(`listFactors: ${listError.message}`);
  const factor =
    factors.totp[0] ?? factors.all.filter((f) => f.factor_type === 'totp' && f.status === 'unverified').at(-1);
  if (!factor) return 'invalid_code';

  if (step !== 'done') {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (error) return 'invalid_code';
  }

  const { data: touch, error } = await supabase.rpc('admin_touch');
  if (error) throw new Error(`admin_touch: ${error.message}`);
  if (touch !== 'ok') {
    // A valid second factor, but not the owner: end the session rather than leave it half-open.
    await supabase.auth.signOut({ scope: 'local' });
    return 'forbidden';
  }
  await audit(supabase, 'auth.sign_in', 'session', 'self', { factor: factor.id });
  return 'ok';
}

export async function signOut(supabase: SupabaseClient, scope: 'local' | 'global'): Promise<void> {
  if (scope === 'global') await audit(supabase, 'auth.sign_out_everywhere', 'session', 'all');
  await supabase.auth.signOut({ scope });
}

/** Appends to the audit log. RLS only lets the owner (AAL2) write, so others are silently skipped. */
export async function audit(
  supabase: SupabaseClient,
  action: string,
  entity: string,
  entityId: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  await supabase.from('audit_events').insert({ action, entity, entity_id: entityId, meta });
}
