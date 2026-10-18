import { withOwner } from '@/server/auth/guard';
import { getAnalytics, parseRange } from '@/server/admin/analytics';
import { sendError } from '@/server/admin/http';

/** GET ?days=7|30|90 → the analytics dashboard (v1.1): visitors, pages, reading time, sources. */
export default withOwner(['GET'], async (req, res, { supabase }) => {
  try {
    res.status(200).json(await getAnalytics(supabase, parseRange(req.query.days)));
  } catch (e) {
    sendError(res, e);
  }
});
