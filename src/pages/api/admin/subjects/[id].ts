import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { deleteSubject, saveSubject } from '@/server/admin/subjects';

/** PUT { name, glyph, color, blurb, intro, visible } → edit (the address stays). DELETE → remove an empty subject. */
export default withOwner(['PUT', 'DELETE'], async (req, res, { supabase }) => {
  const id = String(req.query.id);
  try {
    const { paths } =
      req.method === 'PUT' ? await saveSubject(supabase, id, req.body ?? {}) : await deleteSubject(supabase, id);
    const { failed } = await revalidate(res, paths);
    res.status(200).json({ ok: true, failed });
  } catch (e) {
    sendError(res, e);
  }
});
