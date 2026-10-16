import { withOwner } from '@/server/auth/guard';
import { sendError } from '@/server/admin/http';
import { mediaStore } from '@/server/media/store';
import { startUpload } from '@/server/media/uploads';

/**
 * POST { kind: 'image' | 'file', name, size } → { id, url, headers }: step 1 of an upload.
 * The browser then PUTs the file to `url` with `headers`, and calls POST ./[id] (step 2).
 */
export default withOwner(['POST'], async (req, res) => {
  const store = mediaStore();
  if (!store) return res.status(503).json({ error: 'Uploads aren’t set up yet (R2 settings missing).' });
  try {
    res.status(200).json(await startUpload(store, req.body ?? {}));
  } catch (e) {
    sendError(res, e);
  }
});
