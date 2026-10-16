import { withOwner } from '@/server/auth/guard';
import { sendError } from '@/server/admin/http';
import { deleteMedia, getMedia, updateMedia } from '@/server/media/library';
import { mediaStore } from '@/server/media/store';

/**
 * GET → the item with `used_by` (posts whose draft or live version uses it).
 * PATCH { alt, original_name } → default alt text and display name.
 * DELETE → only when no post uses it (409 otherwise).
 */
export default withOwner(['GET', 'PATCH', 'DELETE'], async (req, res, { supabase }) => {
  const id = String(req.query.id);
  try {
    if (req.method === 'GET') return res.status(200).json(await getMedia(supabase, id));
    if (req.method === 'PATCH') {
      await updateMedia(supabase, id, req.body ?? {});
      return res.status(200).json(await getMedia(supabase, id));
    }
    await deleteMedia(supabase, mediaStore(), id);
    res.status(200).json({ ok: true });
  } catch (e) {
    sendError(res, e);
  }
});
