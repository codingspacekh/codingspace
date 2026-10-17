import { withOwner } from '@/server/auth/guard';
import { listActivity } from '@/server/admin/activity';
import { sendError } from '@/server/admin/http';

/** GET ?before=<id> → { events, more }: the audit log, newest first, 50 at a time (03 ADM-15). */
export default withOwner(['GET'], async (req, res, { supabase }) => {
  try {
    const before = Number(req.query.before);
    res.status(200).json(await listActivity(supabase, Number.isSafeInteger(before) && before > 0 ? { before } : {}));
  } catch (e) {
    sendError(res, e);
  }
});
