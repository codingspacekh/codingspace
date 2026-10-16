import { z } from 'zod';
import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { publishPost } from '@/server/admin/posts';

const body = z.object({ revision: z.number().int().min(1) });

/**
 * POST { revision } → Publish (or Update) that revision of the draft, then rebuild the pages
 * that show it (03 ADM-09, §6.3). → { slug, was_published, refreshed, failed }
 */
export default withOwner(['POST'], async (req, res, { supabase }) => {
  try {
    const result = await publishPost(supabase, String(req.query.id), body.parse(req.body).revision);
    const { failed } = await revalidate(res, result.paths);
    res.status(200).json({
      slug: result.slug,
      was_published: result.was_published,
      refreshed: result.paths.filter((p) => !failed.includes(p)),
      failed,
    });
  } catch (e) {
    sendError(res, e);
  }
});
