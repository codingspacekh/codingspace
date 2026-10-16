import { withOwner } from '@/server/auth/guard';
import { sendError } from '@/server/admin/http';
import { listRevisions } from '@/server/admin/posts';

/** GET → { revisions }: the draft's history, newest first (03 ADM-06). */
export default withOwner(['GET'], async (req, res, { supabase }) => {
  try {
    res.status(200).json({ revisions: await listRevisions(supabase, String(req.query.id)) });
  } catch (e) {
    sendError(res, e);
  }
});
