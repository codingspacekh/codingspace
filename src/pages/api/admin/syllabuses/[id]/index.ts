import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { deleteSyllabus, saveSyllabus } from '@/server/admin/syllabus';

/** PUT { code, title, description, subject_id } → edit (the address stays). DELETE → remove it and its points. */
export default withOwner(['PUT', 'DELETE'], async (req, res, { supabase }) => {
  const id = String(req.query.id);
  try {
    const { paths } =
      req.method === 'PUT' ? await saveSyllabus(supabase, id, req.body ?? {}) : await deleteSyllabus(supabase, id);
    const { failed } = await revalidate(res, paths);
    res.status(200).json({ ok: true, failed });
  } catch (e) {
    sendError(res, e);
  }
});
