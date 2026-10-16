import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { getAuthor, saveAuthor } from '@/server/admin/site';

/** GET → { profile, timeline }. PUT { profile, timeline } → saves both (03 ADM-14). */
export default withOwner(['GET', 'PUT'], async (req, res, { supabase }) => {
  try {
    if (req.method === 'GET') return res.status(200).json(await getAuthor(supabase));
    const { failed } = await revalidate(res, (await saveAuthor(supabase, req.body ?? {})).paths);
    res.status(200).json({ ok: true, failed });
  } catch (e) {
    sendError(res, e);
  }
});
