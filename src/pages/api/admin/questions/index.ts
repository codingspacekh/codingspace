import { withOwner } from '@/server/auth/guard';
import { sendError } from '@/server/admin/http';
import { listQuestions } from '@/server/admin/questions';

/**
 * GET ?status=pending|published|hidden[&post=<slug>][&before=<created_at>][&limit=n]
 * → { questions, counts, more }: newest first, 50 at a time.
 */
export default withOwner(['GET'], async (req, res, { supabase }) => {
  try {
    res.status(200).json(await listQuestions(supabase, req.query));
  } catch (e) {
    sendError(res, e);
  }
});
