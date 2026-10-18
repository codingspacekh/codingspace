/** The most rows the database API returns for one request (Supabase's max_rows). */
export const PAGE_ROWS = 1000;

type DbError = { code?: string; message: string };
type Page<T> = { data: T[] | null; error: DbError | null };
/** Like a single query's answer: rows and no error, or an error and no rows. */
type Result<T> = { data: T[]; error: null } | { data: null; error: DbError };

/**
 * Every row a query matches. The API stops at PAGE_ROWS rows without saying so, so a list that
 * can grow past that (posts, syllabus points, lesson tags) is read a page at a time. `page` builds
 * the query for rows from…to (inclusive); it must be ordered on a unique key, or pages could
 * overlap or skip rows. Answers like a single query: the rows, or the first error.
 */
export async function allRows<T>(page: (from: number, to: number) => PromiseLike<Page<T>>): Promise<Result<T>> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_ROWS) return { data: rows, error: null };
  }
}
