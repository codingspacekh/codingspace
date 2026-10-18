import { withOwner } from '@/server/auth/guard';
import { sendError } from '@/server/admin/http';
import { listFolders, saveFolder } from '@/server/media/library';

/**
 * GET → { folders, all, unsorted }: the media folders A–Z with file counts (v1.1).
 * POST { name } → { id }: a new folder (409 if the name is taken).
 */
export default withOwner(['GET', 'POST'], async (req, res, { supabase }) => {
  try {
    if (req.method === 'GET') return res.status(200).json(await listFolders(supabase));
    res.status(201).json(await saveFolder(supabase, null, req.body ?? {}));
  } catch (e) {
    sendError(res, e);
  }
});
