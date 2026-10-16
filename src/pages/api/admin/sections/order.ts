import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { reorderSections } from '@/server/admin/sections';

/** PUT { subject_id, ids } → every section of the subject, in the new order. */
export default withOwner(['PUT'], async (req, res, { supabase }) => {
  try {
    const { paths } = await reorderSections(supabase, req.body ?? {});
    const { failed } = await revalidate(res, paths);
    res.status(200).json({ ok: true, failed });
  } catch (e) {
    sendError(res, e);
  }
});
