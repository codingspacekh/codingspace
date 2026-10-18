import { withOwner } from '@/server/auth/guard';
import { revalidate, sendError } from '@/server/admin/http';
import { deleteQuestion, saveQuestion } from '@/server/admin/questions';

/** PUT { status, answer } → approve, hide or answer (the lesson's page is rebuilt). DELETE → remove. */
export default withOwner(['PUT', 'DELETE'], async (req, res, { supabase }) => {
  const id = String(req.query.id);
  try {
    const { paths } =
      req.method === 'PUT' ? await saveQuestion(supabase, id, req.body ?? {}) : await deleteQuestion(supabase, id);
    const { failed } = await revalidate(res, paths);
    res.status(200).json({ ok: true, failed });
  } catch (e) {
    sendError(res, e);
  }
});
