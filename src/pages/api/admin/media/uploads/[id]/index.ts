import { withOwner } from '@/server/auth/guard';
import { sendError } from '@/server/admin/http';
import { abortAppUpload, finishAppUpload } from '@/server/media/app-uploads';
import { mediaStore } from '@/server/media/store';
import { finishUpload } from '@/server/media/uploads';

/**
 * POST { kind, name, alt? } → 201 media item (200 with duplicate: true if the same file was
 * uploaded before): step 2, after the browser's PUT. Checks and converts the upload.
 * An app (kind 'app', with size and uploadId) is joined from its parts and checked instead.
 * DELETE { uploadId }: cancels an app upload.
 */

// An app is read once, front to back, to check it (up to 2 GB).
export const config = { maxDuration: 300 };

export default withOwner(['POST', 'DELETE'], async (req, res, { supabase }) => {
  const store = mediaStore();
  if (!store) return res.status(503).json({ error: 'Uploads aren’t set up yet (R2 settings missing).' });
  const id = String(req.query.id);
  try {
    if (req.method === 'DELETE') {
      await abortAppUpload(store, id, req.body ?? {});
      return res.status(204).end();
    }
    const media =
      req.body?.kind === 'app'
        ? await finishAppUpload(supabase, store, id, req.body)
        : await finishUpload(supabase, store, id, req.body ?? {});
    res.status(media.duplicate ? 200 : 201).json(media);
  } catch (e) {
    sendError(res, e);
  }
});
