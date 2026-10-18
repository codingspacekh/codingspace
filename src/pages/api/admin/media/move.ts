import { withOwner } from '@/server/auth/guard';
import { sendError } from '@/server/admin/http';
import { moveMedia } from '@/server/media/library';

/** POST { ids, folder } → { moved }: move files into a folder, or back to Unsorted (folder null) (v1.1). */
export default withOwner(['POST'], async (req, res, { supabase }) => {
  try {
    res.status(200).json(await moveMedia(supabase, req.body ?? {}));
  } catch (e) {
    sendError(res, e);
  }
});
