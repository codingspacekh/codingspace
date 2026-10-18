import type { SupabaseClient } from '@supabase/supabase-js';

/** A refused request, with the HTTP status the API answers (see sendError in ./http). */
export class ApiError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 422,
    message: string,
  ) {
    super(message);
  }
}

export type DbError = { code?: string; message: string };

/**
 * Database refusals the owner can act on, as HTTP statuses: PTxxx are raised by our admin_*
 * functions (they map 1:1); the rest are a missing reference, a duplicate, a failed check, and
 * input the database can't read (a bad uuid or date).
 */
const STATUS: Record<string, ApiError['status']> = {
  PT404: 404,
  PT409: 409,
  PT422: 422,
  '23503': 422,
  '23505': 409,
  '23514': 422,
  '22P02': 400,
  '22007': 422,
};

/** Throws a database error as an ApiError, or as a plain Error (a 500) when it is unexpected. */
export function dbError(error: DbError, what: string): never {
  const status = STATUS[error.code ?? ''];
  if (status) throw new ApiError(status, error.message);
  // Row-level security refused it (not the owner's session): answer as if it weren't there.
  if (error.code === '42501') throw new ApiError(404, 'not allowed');
  throw new Error(`${what}: ${error.message}`);
}

/** Calls a database function; its refusals become ApiErrors. */
export async function rpc<T>(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) dbError(error, fn);
  return data as T;
}
