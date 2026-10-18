import { withOwner } from '@/server/auth/guard';
import { sendError } from '@/server/admin/http';
import { listSubjects } from '@/server/admin/subjects';

/**
 * GET → the signed-in owner and every subject (hidden ones too). The admin pages call it first;
 * a 401 sends them to the sign-in page.
 */
export default withOwner(['GET'], async (_req, res, { owner, supabase }) => {
  try {
    res.status(200).json({ email: owner.email, subjects: await listSubjects(supabase) });
  } catch (e) {
    sendError(res, e);
  }
});
