import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { deleteProject, saveProject } from '@/server/admin/site';

/** PUT { name, description, landing_url, … } → edit. DELETE → remove (03 ADM-13). */
export default withOwner(['PUT', 'DELETE'], async (req, res, { supabase }) => {
  const id = String(req.query.id);
  try {
    const { paths } =
      req.method === 'PUT' ? await saveProject(supabase, id, req.body ?? {}) : await deleteProject(supabase, id);
    const { failed } = await revalidate(res, paths);
    res.status(200).json({ ok: true, failed });
  } catch (e) {
    sendError(res, e);
  }
});
