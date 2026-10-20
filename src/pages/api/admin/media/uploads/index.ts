import { withOwner } from '@/server/auth/guard';
import { sendError } from '@/server/admin/http';
import { startAppUpload } from '@/server/media/app-uploads';
import { mediaStore } from '@/server/media/store';
import { startUpload } from '@/server/media/uploads';

/**
 * POST { kind: 'image' | 'file', name, size } → { id, url, headers }: step 1 of an upload.
 * The browser then PUTs the file to `url` with `headers`, and calls POST ./[id] (step 2).
 * POST { kind: 'app', name, size } → { id, uploadId, partSize, parts }: an app goes up in parts
 * (URLs from POST ./[id]/parts), and POST ./[id] joins them.
 */
export default withOwner(['POST'], async (req, res) => {
  const store = mediaStore();
  if (!store) return res.status(503).json({ error: 'Uploads aren’t set up yet (R2 settings missing).' });
  try {
    const body = req.body ?? {};
    res.status(200).json(body.kind === 'app' ? await startAppUpload(store, body) : await startUpload(store, body));
  } catch (e) {
    sendError(res, e);
  }
});
