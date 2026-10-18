import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { saveSyllabusPoints } from '@/server/admin/syllabus';

/** PUT [{ id?, code, title }] → the syllabus's whole list of points, in order. */
export default withOwner(['PUT'], async (req, res, { supabase }) => {
  try {
    const { failed } = await revalidate(
      res,
      (await saveSyllabusPoints(supabase, String(req.query.id), req.body)).paths,
    );
    res.status(200).json({ ok: true, failed });
  } catch (e) {
    sendError(res, e);
  }
});
