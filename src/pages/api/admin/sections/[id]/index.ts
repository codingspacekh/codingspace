import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { deleteSection, updateSection } from '@/server/admin/sections';

/**
 * PATCH { title, description } → rename / describe (the address stays the same).
 * DELETE → { deleted }: the section and every lesson in it.
 */
export default withOwner(['PATCH', 'DELETE'], async (req, res, { supabase }) => {
  const id = String(req.query.id);
  try {
    const result =
      req.method === 'PATCH' ? await updateSection(supabase, id, req.body ?? {}) : await deleteSection(supabase, id);
    const { failed } = await revalidate(res, result.paths);
    res.status(200).json({ ok: true, failed, ...('deleted' in result && { deleted: result.deleted }) });
  } catch (e) {
    sendError(res, e);
  }
});
