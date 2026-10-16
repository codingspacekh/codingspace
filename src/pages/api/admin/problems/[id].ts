import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { deleteProblem, saveProblem, setCurrentProblem } from '@/server/admin/site';

/**
 * PUT { subject_id, week_of, statement, … } → edit. PATCH { current } → show it as its
 * subject's problem of the week, or stop showing it. DELETE → remove.
 */
export default withOwner(['PUT', 'PATCH', 'DELETE'], async (req, res, { supabase }) => {
  const id = String(req.query.id);
  try {
    const { paths } =
      req.method === 'PUT'
        ? await saveProblem(supabase, id, req.body ?? {})
        : req.method === 'PATCH'
          ? await setCurrentProblem(supabase, id, req.body ?? {})
          : await deleteProblem(supabase, id);
    const { failed } = await revalidate(res, paths);
    res.status(200).json({ ok: true, failed });
  } catch (e) {
    sendError(res, e);
  }
});
