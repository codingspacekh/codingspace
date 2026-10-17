import { withOwner } from '@/server/auth/guard';
import { audit } from '@/server/auth/flow';
import { DOWNLOAD_LIMIT, exportZip } from '@/server/export/bundle';
import { sendError } from '@/server/admin/http';

/** GET → a ZIP of all content: content.json plus each post as Markdown (03 ADM-16). */
export default withOwner(['GET'], async (_req, res, { supabase }) => {
  try {
    const { filename, body, counts, omitted } = await exportZip(supabase, { maxBytes: DOWNLOAD_LIMIT });
    await audit(supabase, 'content.export', 'content', 'all', { posts: counts.posts, omitted });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(body);
  } catch (e) {
    sendError(res, e);
  }
});
