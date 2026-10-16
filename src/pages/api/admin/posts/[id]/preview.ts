import { withOwner } from '@/server/auth/guard';
import { sendError } from '@/server/admin/http';
import { previewPost } from '@/server/admin/preview';

/** GET → the draft as lesson-page data (03 ADM-08), for /admin/posts/[id]/preview. */
export default withOwner(['GET'], async (req, res, { supabase }) => {
  try {
    res.status(200).json(await previewPost(supabase, String(req.query.id)));
  } catch (e) {
    sendError(res, e);
  }
});
