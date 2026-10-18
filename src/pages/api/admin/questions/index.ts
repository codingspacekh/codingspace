import { withOwner } from '@/server/auth/guard';
import { sendError } from '@/server/admin/http';
import { listQuestions } from '@/server/admin/questions';

/** GET ?status=pending|published|hidden → { questions }, newest first. */
export default withOwner(['GET'], async (req, res, { supabase }) => {
  try {
    res.status(200).json({ questions: await listQuestions(supabase, req.query.status) });
  } catch (e) {
    sendError(res, e);
  }
});
