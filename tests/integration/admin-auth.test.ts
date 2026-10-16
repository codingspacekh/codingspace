import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { checkOwner } from '@/server/auth/guard';
import { currentStep, signInWithPassword, signOut, startEnrolment, verifyCode } from '@/server/auth/flow';
import { OTHER, OWNER, resetUser, serviceClient, totp } from '../support/admin-users';

// The admin gate against a real local Supabase Auth: password, TOTP enrolment, AAL2, allow-list,
// revocation. The 12 h idle rule itself is covered by supabase/tests/admin_session.test.sql.

const { API_URL, ANON_KEY } = process.env;
const browser = (): SupabaseClient =>
  createClient(API_URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

async function signInWithTwoFactor(user: typeof OWNER, step = 0) {
  const supabase = browser();
  await signInWithPassword(supabase, user);
  let secret = secrets.get(user.id);
  if (!secret) {
    const enrolment = await startEnrolment(supabase);
    if (enrolment === 'not_allowed') throw new Error('enrolment not allowed');
    secret = enrolment.secret;
    secrets.set(user.id, secret);
  }
  return { supabase, result: await verifyCode(supabase, totp(secret, step)) };
}
const secrets = new Map<string, string>();

describe('admin sign-in against Supabase Auth', () => {
  beforeAll(async () => {
    const admin = serviceClient();
    await resetUser(admin, OWNER);
    await resetUser(admin, OTHER);
  });

  it('nobody can create an account (sign-up is disabled, sign-in is not)', async () => {
    const { data, error } = await browser().auth.signUp({ email: 'new@codingspace.test', password: 'New-Passw0rd!x' });
    expect(error?.code).toBe('signup_disabled');
    expect(data.user).toBeNull();
  });

  it('refuses a wrong password with a generic error', async () => {
    const result = await signInWithPassword(browser(), { email: OWNER.email, password: 'wrong-password' });
    expect(result).toEqual({ ok: false, status: 401 });
  });

  it('a password alone is AAL1: the next step is enrolment, and the admin gate says 403', async () => {
    const supabase = browser();
    expect(await signInWithPassword(supabase, OWNER)).toEqual({ ok: true, step: 'enroll' });
    expect(await checkOwner(supabase)).toEqual({ ok: false, status: 403, error: 'mfa_required' });
  });

  it('no session at all is 401', async () => {
    expect(await checkOwner(browser())).toEqual({ ok: false, status: 401, error: 'unauthenticated' });
  });

  it('refuses a wrong code, then the owner enrols TOTP and passes the gate', async () => {
    const supabase = browser();
    await signInWithPassword(supabase, OWNER);
    const enrolment = await startEnrolment(supabase);
    if (enrolment === 'not_allowed') throw new Error('enrolment not allowed');
    // Exactly one data: prefix, then the encoded SVG (a double prefix was a real bug on staging).
    expect(enrolment.qr).toMatch(/^data:image\/svg\+xml;charset=utf-8,(%3C%3Fxml|%3Csvg)/);
    expect(await verifyCode(supabase, '000000')).toBe('invalid_code');

    secrets.set(OWNER.id, enrolment.secret);
    expect(await verifyCode(supabase, totp(enrolment.secret))).toBe('ok');
    expect(await currentStep(supabase)).toBe('done');
    expect(await checkOwner(supabase)).toMatchObject({ ok: true, userId: OWNER.id, email: OWNER.email });
  });

  it('after enrolment, a new sign-in asks to verify, and enrolling again is not allowed', async () => {
    const supabase = browser();
    expect(await signInWithPassword(supabase, OWNER)).toEqual({ ok: true, step: 'verify' });
    expect(await startEnrolment(supabase)).toBe('not_allowed');
  });

  it('another account with 2FA is refused (403) and its session is ended', async () => {
    const { supabase, result } = await signInWithTwoFactor(OTHER);
    expect(result).toBe('forbidden');
    expect(await checkOwner(supabase)).toMatchObject({ ok: false, status: 401 });
  });

  it('"sign out everywhere" revokes other sessions at once, even with an unexpired access token', async () => {
    const first = await signInWithTwoFactor(OWNER, 1);
    const second = await signInWithTwoFactor(OWNER, 1);
    expect(first.result).toBe('ok');
    expect(second.result).toBe('ok');

    await signOut(second.supabase, 'global');
    expect(await checkOwner(first.supabase)).toMatchObject({ ok: false, status: 401 });
  });
});
