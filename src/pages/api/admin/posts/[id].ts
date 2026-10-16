import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { deletePost } from '@/server/admin/posts';

/** DELETE → { slug, refreshed }: removes the post and its revisions; rebuilds its pages if it was live. */
export default withOwner(['DELETE'], async (req, res, { supabase }) => {
  try {
    const result = await deletePost(supabase, String(req.query.id));
    const { failed } = await revalidate(res, result.paths);
    res.status(200).json({ slug: result.slug, refreshed: result.paths.filter((p) => !failed.includes(p)) });
  } catch (e) {
    sendError(res, e);
  }
});
