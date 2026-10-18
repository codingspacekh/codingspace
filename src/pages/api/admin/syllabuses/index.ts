import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { listSyllabuses, saveSyllabus } from '@/server/admin/syllabus';

/** GET → { syllabuses } (with their points). POST { code, title, description, subject_id } → 201 { id }. */
export default withOwner(['GET', 'POST'], async (req, res, { supabase }) => {
  try {
    if (req.method === 'GET') return res.status(200).json({ syllabuses: await listSyllabuses(supabase) });
    const { id, paths } = await saveSyllabus(supabase, null, req.body ?? {});
    const { failed } = await revalidate(res, paths);
    res.status(201).json({ id, failed });
  } catch (e) {
    sendError(res, e);
  }
});
