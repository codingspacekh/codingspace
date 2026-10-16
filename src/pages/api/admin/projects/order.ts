import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { reorderProjects } from '@/server/admin/site';

/** PUT { ids } → every project, in the new order. */
export default withOwner(['PUT'], async (req, res, { supabase }) => {
  try {
    const { failed } = await revalidate(res, (await reorderProjects(supabase, req.body ?? {})).paths);
    res.status(200).json({ ok: true, failed });
  } catch (e) {
    sendError(res, e);
  }
});
