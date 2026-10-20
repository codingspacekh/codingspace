import { withOwner } from '@/server/auth/guard';
import { sendError } from '@/server/admin/http';
import { partUrls } from '@/server/media/app-uploads';
import { mediaStore } from '@/server/media/store';

/** POST { uploadId, parts: [1, 2, …] } → { urls: { 1: url, … } }: where the browser PUTs an app's parts. */
export default withOwner(['POST'], async (req, res) => {
  const store = mediaStore();
  if (!store) return res.status(503).json({ error: 'Uploads aren’t set up yet (R2 settings missing).' });
  try {
    res.status(200).json(await partUrls(store, String(req.query.id), req.body ?? {}));
  } catch (e) {
    sendError(res, e);
  }
});
