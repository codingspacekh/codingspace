import { withOwner } from '@/server/auth/guard';
import { dashboard } from '@/server/admin/list';
import { sendError } from '@/server/admin/http';

/** GET → { counts, recent, activity } (03 ADM-02, ADM-15). */
export default withOwner(['GET'], async (_req, res, { supabase }) => {
  try {
    res.status(200).json(await dashboard(supabase));
  } catch (e) {
    sendError(res, e);
  }
});
