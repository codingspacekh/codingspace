import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { listSubjectsWithCounts, saveSubject } from '@/server/admin/subjects';

/** GET → { subjects } (hidden ones too, with section and lesson counts). POST { id?, name, … } → 201 { id }. */
export default withOwner(['GET', 'POST'], async (req, res, { supabase }) => {
  try {
    if (req.method === 'GET') return res.status(200).json({ subjects: await listSubjectsWithCounts(supabase) });
    const { id, paths } = await saveSubject(supabase, null, req.body ?? {});
    const { failed } = await revalidate(res, paths);
    res.status(201).json({ id, failed });
  } catch (e) {
    sendError(res, e);
  }
});
