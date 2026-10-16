import { z } from 'zod';
import { withOwner } from '@/server/auth/guard';
import { sendError } from '@/server/admin/http';
import { restoreRevision, revisionId, revisionPreview } from '@/server/admin/posts';

const restoreBody = z.object({ revision: z.number().int().min(1) });

/**
 * GET → { revision, html }: one version, rendered as students would see it.
 * POST { revision } → { revision }: restores it into the draft (the current draft is kept as a
 * revision first, so this can be undone). 409 if the draft changed since `revision`.
 */
export default withOwner(['GET', 'POST'], async (req, res, { supabase }) => {
  const id = String(req.query.id);
  try {
    if (req.method === 'GET') return res.status(200).json(await revisionPreview(supabase, id, req.query.rev));
    const body = restoreBody.parse(req.body);
    res
      .status(200)
      .json({ revision: await restoreRevision(supabase, id, body.revision, revisionId.parse(req.query.rev)) });
  } catch (e) {
    sendError(res, e);
  }
});
