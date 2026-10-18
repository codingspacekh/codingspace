// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAnalytics, parseRange } from '@/server/admin/analytics';

describe('admin analytics read', () => {
  it('takes 7, 30 or 90 days, else 30', () => {
    expect(parseRange('7')).toBe(7);
    expect(parseRange('90')).toBe(90);
    expect(parseRange('365')).toBe(30);
    expect(parseRange(undefined)).toBe(30);
    expect(parseRange(['7'])).toBe(7);
  });

  it('reads admin_analytics for the range', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { today: '2026-10-18' }, error: null });
    expect(await getAnalytics({ rpc } as unknown as SupabaseClient, 7)).toEqual({ today: '2026-10-18' });
    expect(rpc).toHaveBeenCalledWith('admin_analytics', { p_days: 7 });
  });

  it('throws on a database error', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'nope' } });
    await expect(getAnalytics({ rpc } as unknown as SupabaseClient, 30)).rejects.toThrow('admin_analytics: nope');
  });
});
