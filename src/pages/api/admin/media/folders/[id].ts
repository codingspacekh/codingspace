import { withOwner } from '@/server/auth/guard';
import { sendError } from '@/server/admin/http';
import { deleteFolder, saveFolder } from '@/server/media/library';

/**
 * PATCH { name } → { id }: rename a media folder (v1.1).
 * DELETE → { moved }: delete it; its files go back to Unsorted.
 */
export default withOwner(['PATCH', 'DELETE'], async (req, res, { supabase }) => {
  const id = String(req.query.id);
  try {
    if (req.method === 'PATCH') return res.status(200).json(await saveFolder(supabase, id, req.body ?? {}));
    res.status(200).json(await deleteFolder(supabase, id));
  } catch (e) {
    sendError(res, e);
  }
});
