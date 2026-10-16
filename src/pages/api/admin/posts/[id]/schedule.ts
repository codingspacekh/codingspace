import { z } from 'zod';
import { withOwner } from '@/server/auth/guard';
import { sendError } from '@/server/admin/http';
import { schedulePost, unschedulePost } from '@/server/admin/posts';

const body = z.object({ revision: z.number().int().min(1), at: z.iso.datetime({ offset: true }) });

/** POST { revision, at } → schedule the draft; DELETE → cancel the schedule (back to a draft). */
export default withOwner(['POST', 'DELETE'], async (req, res, { supabase }) => {
  const id = String(req.query.id);
  try {
    if (req.method === 'DELETE') {
      await unschedulePost(supabase, id);
      return res.status(200).json({ ok: true });
    }
    const { revision, at } = body.parse(req.body);
    await schedulePost(supabase, id, revision, new Date(at));
    res.status(200).json({ ok: true, at });
  } catch (e) {
    sendError(res, e);
  }
});
