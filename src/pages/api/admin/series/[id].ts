import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { deleteSeries, saveSeries } from '@/server/admin/series';

/** PUT { title, description, post_ids } → edit (the lessons are replaced in the given order). DELETE → remove. */
export default withOwner(['PUT', 'DELETE'], async (req, res, { supabase }) => {
  const id = String(req.query.id);
  try {
    const { paths } =
      req.method === 'PUT' ? await saveSeries(supabase, id, req.body ?? {}) : await deleteSeries(supabase, id);
    const { failed } = await revalidate(res, paths);
    res.status(200).json({ ok: true, failed });
  } catch (e) {
    sendError(res, e);
  }
});
