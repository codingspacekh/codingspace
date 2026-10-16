import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { featureProject } from '@/server/admin/site';

/** PUT { id } → the one featured project (null: none). */
export default withOwner(['PUT'], async (req, res, { supabase }) => {
  try {
    const { failed } = await revalidate(res, (await featureProject(supabase, req.body?.id ?? null)).paths);
    res.status(200).json({ ok: true, failed });
  } catch (e) {
    sendError(res, e);
  }
});
