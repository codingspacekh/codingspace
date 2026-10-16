/** Browser-side calls to our own admin and auth API routes (same origin, cookies included). */

export type ApiResult<T> = { status: number; data: T };

export async function api<T = Record<string, unknown>>(
  path: string,
  { method = 'GET', body }: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
}

/** Only admin paths are allowed after sign-in, so ?next= can't send the owner to another site. */
export function safeNext(next: unknown): string {
  if (typeof next !== 'string') return '/admin';
  return /^\/admin(\/[\w\-/]*)?$/.test(next) && next !== '/admin/login' ? next : '/admin';
}
