// @vitest-environment node
import { ApiError, dbError, rpc } from '@/server/admin/errors';

const thrown = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error('did not throw');
};

describe('database errors as API errors', () => {
  it('maps what the owner can act on to its HTTP status, with the database’s message', () => {
    const cases: [string, number][] = [
      ['PT404', 404],
      ['PT409', 409],
      ['PT422', 422],
      ['23503', 422], // a missing reference
      ['23505', 409], // a duplicate
      ['23514', 422], // a failed check
      ['22P02', 400], // not a uuid
      ['22007', 422], // not a date
    ];
    for (const [code, status] of cases) {
      const e = thrown(() => dbError({ code, message: `refused ${code}` }, 'fn'));
      expect(e).toBeInstanceOf(ApiError);
      expect(e).toMatchObject({ status, message: `refused ${code}` });
    }
  });

  it('answers a row-level security refusal as "not found", and anything else as a plain error (500)', () => {
    expect(thrown(() => dbError({ code: '42501', message: 'permission denied for table posts' }, 'fn'))).toMatchObject({
      status: 404,
      message: 'not allowed',
    });
    const e = thrown(() => dbError({ code: '57014', message: 'canceling statement' }, 'admin_x'));
    expect(e).not.toBeInstanceOf(ApiError);
    expect((e as Error).message).toBe('admin_x: canceling statement');
    expect(thrown(() => dbError({ message: 'no code' }, 'q'))).not.toBeInstanceOf(ApiError);
  });

  it('calls a database function and returns its data, or throws its refusal', async () => {
    const supabase = {
      rpc: vi.fn(async (fn: string) =>
        fn === 'ok' ? { data: 7, error: null } : { data: null, error: { code: 'PT409', message: 'taken' } },
      ),
    };
    await expect(rpc<number>(supabase as never, 'ok', { a: 1 })).resolves.toBe(7);
    expect(supabase.rpc).toHaveBeenCalledWith('ok', { a: 1 });
    await expect(rpc(supabase as never, 'bad', {})).rejects.toMatchObject({ status: 409, message: 'taken' });
  });
});
