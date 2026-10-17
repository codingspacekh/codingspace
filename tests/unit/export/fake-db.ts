import type { SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;

/**
 * An in-memory stand-in for the Supabase query builder, with just the calls src/server/export
 * and src/server/admin/activity.ts make: select (with a head count), order, range, limit, lt,
 * in, not…in, insert and upsert. `fail` makes a table answer with an error; `reads` lists the
 * tables queried, in order.
 */
export function fakeDb(tables: Record<string, Row[]>, { fail = {} as Record<string, string> } = {}) {
  const writes: { table: string; op: 'insert' | 'upsert'; rows: Row[]; onConflict?: string }[] = [];
  const reads: string[] = [];

  function query(table: string) {
    reads.push(table);
    let rows = () => [...(tables[table] ?? [])];
    let head = false;
    const sorts: [string, boolean][] = [];
    let slice: [number, number] | null = null;
    let write: Promise<{ error: { message: string } | null }> | null = null;

    const run = () => {
      if (fail[table]) return { data: null, count: null, error: { message: fail[table] } };
      let out = rows();
      for (const [col, asc] of [...sorts].reverse()) {
        out.sort(
          (a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1),
        );
      }
      if (head) return { data: null, count: out.length, error: null };
      if (slice) out = out.slice(slice[0], slice[1] + 1);
      return { data: out.map((r) => ({ ...r })), count: null, error: null };
    };

    const builder = {
      select(_cols?: string, opts?: { head?: boolean }) {
        head = !!opts?.head;
        return builder;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        sorts.push([col, opts?.ascending !== false]);
        return builder;
      },
      range(from: number, to: number) {
        slice = [from, to];
        return builder;
      },
      limit(n: number) {
        slice = [0, n - 1];
        return builder;
      },
      lt(col: string, v: number) {
        const prev = rows;
        rows = () => prev().filter((r) => (r[col] as number) < v);
        return builder;
      },
      in(col: string, values: unknown[]) {
        const prev = rows;
        rows = () => prev().filter((r) => values.includes(r[col]));
        return builder;
      },
      not(col: string, _op: 'in', list: string) {
        const values = list.replace(/^\(|\)$/g, '').split(',');
        const prev = rows;
        rows = () => prev().filter((r) => !values.includes(String(r[col])));
        return builder;
      },
      insert(batch: Row[]) {
        writes.push({ table, op: 'insert', rows: batch });
        write = Promise.resolve({ error: fail[table] ? { message: fail[table] } : null });
        return builder;
      },
      upsert(batch: Row[], opts?: { onConflict?: string }) {
        writes.push({ table, op: 'upsert', rows: batch, onConflict: opts?.onConflict });
        write = Promise.resolve({ error: fail[table] ? { message: fail[table] } : null });
        return builder;
      },
      then<T>(resolve: (v: ReturnType<typeof run>) => T, reject?: (e: unknown) => T) {
        return (write ?? Promise.resolve(run())).then(resolve as never, reject);
      },
    };
    return builder;
  }

  return { client: { from: query } as unknown as SupabaseClient, writes, reads };
}
