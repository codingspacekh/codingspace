import { postFilters } from '@/lib/admin-posts';
import { withOwner } from '@/server/auth/guard';
import { listPosts } from '@/server/admin/list';
import { sendError } from '@/server/admin/http';
import { createPost } from '@/server/admin/posts';

/**
 * GET ?q&kind&subject&status → { posts } (03 ADM-03).
 * POST { kind, title?, subject_id?, section_id?, lang? } → 201 { id, slug }: a new draft.
 */
export default withOwner(['GET', 'POST'], async (req, res, { supabase }) => {
  try {
    if (req.method === 'GET') return res.status(200).json({ posts: await listPosts(supabase, postFilters(req.query)) });
    res.status(201).json(await createPost(supabase, req.body ?? {}));
  } catch (e) {
    sendError(res, e);
  }
});
