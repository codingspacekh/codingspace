import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { reorderLessons } from '@/server/admin/sections';

/** PUT { ids } → every lesson of the section, in the new order (prev/next follow it). */
export default withOwner(['PUT'], async (req, res, { supabase }) => {
  try {
    const { paths } = await reorderLessons(supabase, String(req.query.id), req.body ?? {});
    const { failed } = await revalidate(res, paths);
    res.status(200).json({ ok: true, failed });
  } catch (e) {
    sendError(res, e);
  }
});
