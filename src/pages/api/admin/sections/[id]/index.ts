import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { deleteSection, updateSection } from '@/server/admin/sections';

/**
 * PATCH { title, description } → rename / describe (the address stays the same).
 * DELETE → only an empty section (409 otherwise).
 */
export default withOwner(['PATCH', 'DELETE'], async (req, res, { supabase }) => {
  const id = String(req.query.id);
  try {
    const { paths } =
      req.method === 'PATCH' ? await updateSection(supabase, id, req.body ?? {}) : await deleteSection(supabase, id);
    const { failed } = await revalidate(res, paths);
    res.status(200).json({ ok: true, failed });
  } catch (e) {
    sendError(res, e);
  }
});
