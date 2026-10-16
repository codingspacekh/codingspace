import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { createSection, listStructure } from '@/server/admin/sections';

/**
 * GET ?subject= → { sections }: the subject's sections in order, with their lessons (03 ADM-12).
 * POST { subject_id, title, description? } → 201 { id, subject_id, slug, title, sort }: added last.
 */
export default withOwner(['GET', 'POST'], async (req, res, { supabase }) => {
  try {
    if (req.method === 'GET')
      return res.status(200).json({ sections: await listStructure(supabase, req.query.subject) });
    const section = await createSection(supabase, req.body ?? {});
    // The subject page lists every section, empty ones as "coming soon".
    await revalidate(res, [`/study/${section.subject_id}`]);
    res.status(201).json(section);
  } catch (e) {
    sendError(res, e);
  }
});
