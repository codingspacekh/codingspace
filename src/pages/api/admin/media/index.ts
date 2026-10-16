import { withOwner } from '@/server/auth/guard';
import { sendError } from '@/server/admin/http';
import { listMedia } from '@/server/media/library';

/** GET ?kind=image|file&q=&unused=1&before= → { items, more }: the media library, newest first. */
export default withOwner(['GET'], async (req, res, { supabase }) => {
  try {
    res.status(200).json(await listMedia(supabase, req.query));
  } catch (e) {
    sendError(res, e);
  }
});
