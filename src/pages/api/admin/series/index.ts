import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { listLessonChoices, listSeries, saveSeries } from '@/server/admin/series';

/** GET → { series, lessons } (lessons: every lesson that can go in one). POST { title, description, post_ids } → 201 { id }. */
export default withOwner(['GET', 'POST'], async (req, res, { supabase }) => {
  try {
    if (req.method === 'GET') {
      const [series, lessons] = await Promise.all([listSeries(supabase), listLessonChoices(supabase)]);
      return res.status(200).json({ series, lessons });
    }
    const { id, paths } = await saveSeries(supabase, null, req.body ?? {});
    const { failed } = await revalidate(res, paths);
    res.status(201).json({ id, failed });
  } catch (e) {
    sendError(res, e);
  }
});
