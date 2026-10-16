import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { listProjects, saveProject } from '@/server/admin/site';

/** GET → { projects } in order. POST { name, description, landing_url, … } → 201 { id }: added last (03 ADM-13). */
export default withOwner(['GET', 'POST'], async (req, res, { supabase }) => {
  try {
    if (req.method === 'GET') return res.status(200).json({ projects: await listProjects(supabase) });
    const { id, paths } = await saveProject(supabase, null, req.body ?? {});
    const { failed } = await revalidate(res, paths);
    res.status(201).json({ id, failed });
  } catch (e) {
    sendError(res, e);
  }
});
