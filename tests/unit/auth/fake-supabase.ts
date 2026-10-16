import type { SupabaseClient } from '@supabase/supabase-js';
import { vi } from 'vitest';

type Factor = { id: string; factor_type: 'totp'; status: 'verified' | 'unverified' };

/** A stand-in for the request-bound Supabase client, with just what src/server/auth uses. */
export function fakeSupabase({
  claims = null as Record<string, unknown> | null,
  touch = 'ok' as string | null,
  touchError = null as { code: string; message: string } | null,
  factors = [] as Factor[],
  passwordError = null as { status: number } | null,
  verifyError = null as { message: string } | null,
} = {}) {
  const auth = {
    getClaims: vi.fn(async () => ({ data: claims ? { claims } : null, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    signInWithPassword: vi.fn(async () => ({ data: {}, error: passwordError })),
    mfa: {
      listFactors: vi.fn(async () => ({
        data: { all: factors, totp: factors.filter((f) => f.status === 'verified') },
        error: null,
      })),
      unenroll: vi.fn(async () => ({ error: null })),
      enroll: vi.fn(async () => ({
        data: {
          id: 'factor-new',
          totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'SECRET', uri: 'otpauth://x' },
        },
        error: null,
      })),
      challengeAndVerify: vi.fn(async () => ({ data: {}, error: verifyError })),
    },
  };
  const insert = vi.fn(async () => ({ error: null }));
  const client = {
    auth,
    rpc: vi.fn(async () => ({ data: touchError ? null : touch, error: touchError })),
    from: vi.fn(() => ({ insert })),
  };
  return { client: client as unknown as SupabaseClient, auth, rpc: client.rpc, insert };
}

export const OWNER_CLAIMS = { sub: 'owner-id', email: 'owner@example.test', aal: 'aal2' };
