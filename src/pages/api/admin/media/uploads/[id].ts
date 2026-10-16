import { withOwner } from '@/server/auth/guard';
import { sendError } from '@/server/admin/http';
import { mediaStore } from '@/server/media/store';
import { finishUpload } from '@/server/media/uploads';

/**
 * POST { kind, name, alt? } → 201 media item (200 with duplicate: true if the same file was
 * uploaded before): step 2, after the browser's PUT. Checks and converts the upload.
 */
export default withOwner(['POST'], async (req, res, { supabase }) => {
  const store = mediaStore();
  if (!store) return res.status(503).json({ error: 'Uploads aren’t set up yet (R2 settings missing).' });
  try {
    const media = await finishUpload(supabase, store, String(req.query.id), req.body ?? {});
    res.status(media.duplicate ? 200 : 201).json(media);
  } catch (e) {
    sendError(res, e);
  }
});
