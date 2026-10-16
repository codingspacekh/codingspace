import { z } from 'zod';
import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { deletePost, getPostForEdit, saveDraft } from '@/server/admin/posts';

const saveBody = z.object({ revision: z.number().int().min(1), fields: z.record(z.string(), z.unknown()) });

/**
 * GET → { post, sections }: the draft for the editor.
 * PUT { revision, fields } → { revision, slug }: saves the draft (409 if another tab saved first).
 * DELETE → { slug, refreshed }: removes the post and its revisions; rebuilds its pages if it was live.
 */
export default withOwner(['GET', 'PUT', 'DELETE'], async (req, res, { supabase }) => {
  const id = String(req.query.id);
  try {
    if (req.method === 'GET') return res.status(200).json(await getPostForEdit(supabase, id));
    if (req.method === 'PUT') {
      const body = saveBody.parse(req.body);
      return res.status(200).json(await saveDraft(supabase, id, body.revision, body.fields));
    }
    const result = await deletePost(supabase, id);
    const { failed } = await revalidate(res, result.paths);
    res.status(200).json({ slug: result.slug, refreshed: result.paths.filter((p) => !failed.includes(p)) });
  } catch (e) {
    sendError(res, e);
  }
});
