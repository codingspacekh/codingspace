import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { listProblems, saveProblem } from '@/server/admin/site';

/** GET → { problems }, newest week first. POST { subject_id, week_of, statement, … } → 201 { id } (03 ADM-11). */
export default withOwner(['GET', 'POST'], async (req, res, { supabase }) => {
  try {
    if (req.method === 'GET') return res.status(200).json({ problems: await listProblems(supabase) });
    const { id, paths } = await saveProblem(supabase, null, req.body ?? {});
    const { failed } = await revalidate(res, paths);
    res.status(201).json({ id, failed });
  } catch (e) {
    sendError(res, e);
  }
});
