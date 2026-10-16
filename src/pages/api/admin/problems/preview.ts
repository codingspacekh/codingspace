import { withOwner } from '@/server/auth/guard';
import { sendError } from '@/server/admin/http';
import { previewProblem } from '@/server/admin/site';

/** POST { statement, hint, solution } → their HTML, as students would see it (live preview). */
export default withOwner(['POST'], async (req, res) => {
  try {
    res.status(200).json(await previewProblem(req.body ?? {}));
  } catch (e) {
    sendError(res, e);
  }
});
