import { withOwner } from '@/server/auth/guard';
import { sendError } from '@/server/admin/http';
import { previewPost } from '@/server/admin/preview';
import { listSubjects } from '@/server/admin/subjects';

/**
 * GET → the draft as lesson-page data (03 ADM-08), for /admin/posts/[id]/preview, with the
 * subjects the menus show visitors (and the draft's own, if it is in a hidden subject).
 */
export default withOwner(['GET'], async (req, res, { supabase }) => {
  try {
    const [data, subjects] = await Promise.all([previewPost(supabase, String(req.query.id)), listSubjects(supabase)]);
    res.status(200).json({
      ...data,
      subjects: subjects.filter((s) => s.visible || s.id === data.post.subject),
    });
  } catch (e) {
    sendError(res, e);
  }
});
