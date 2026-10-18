import type { SupabaseClient } from '@supabase/supabase-js';
import { RANGES, type Analytics, type Range } from '@/lib/analytics';

/** The analytics dashboard (v1.1) in one read: public.admin_analytics, owner only through RLS. */

export const parseRange = (v: unknown): Range => {
  const n = Number(v);
  return (RANGES as readonly number[]).includes(n) ? (n as Range) : 30;
};

export async function getAnalytics(supabase: SupabaseClient, days: Range): Promise<Analytics> {
  const { data, error } = await supabase.rpc('admin_analytics', { p_days: days });
  if (error) throw new Error(`admin_analytics: ${error.message}`);
  return data as Analytics;
}
