import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { createSection } from '@/server/admin/sections';

/** POST { subject_id, title, description? } → 201 { id, subject_id, slug, title }: a new section, last in its subject. */
export default withOwner(['POST'], async (req, res, { supabase }) => {
  try {
    const section = await createSection(supabase, req.body ?? {});
    // The subject page lists every section, empty ones as "coming soon".
    await revalidate(res, [`/study/${section.subject_id}`]);
    res.status(201).json(section);
  } catch (e) {
    sendError(res, e);
  }
});
