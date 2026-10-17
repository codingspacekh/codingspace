import { withOwner } from '@/server/auth/guard';
import { sendError } from '@/server/admin/http';
import { previewBio } from '@/server/admin/site';

/** POST { bio } → { html }, as visitors would see it (live preview). */
export default withOwner(['POST'], async (req, res) => {
  try {
    res.status(200).json(await previewBio(req.body ?? {}));
  } catch (e) {
    sendError(res, e);
  }
});
