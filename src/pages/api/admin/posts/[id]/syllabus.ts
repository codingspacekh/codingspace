import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { getPostSyllabus, setPostSyllabus } from '@/server/admin/syllabus';

/** GET → { syllabuses, point_ids }: what the lesson can be tagged with, and its tags. PUT { point_ids } → replace them. */
export default withOwner(['GET', 'PUT'], async (req, res, { supabase }) => {
  const id = String(req.query.id);
  try {
    if (req.method === 'GET') return res.status(200).json(await getPostSyllabus(supabase, id));
    const { failed } = await revalidate(res, (await setPostSyllabus(supabase, id, req.body ?? {})).paths);
    res.status(200).json({ ok: true, failed });
  } catch (e) {
    sendError(res, e);
  }
});
