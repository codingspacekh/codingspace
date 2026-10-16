import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { unpublishPost } from '@/server/admin/posts';

/** POST → takes the post off the site (back to a draft) and rebuilds its pages. */
export default withOwner(['POST'], async (req, res, { supabase }) => {
  try {
    const result = await unpublishPost(supabase, String(req.query.id));
    const { failed } = await revalidate(res, result.paths);
    res.status(200).json({ slug: result.slug, refreshed: result.paths.filter((p) => !failed.includes(p)), failed });
  } catch (e) {
    sendError(res, e);
  }
});
