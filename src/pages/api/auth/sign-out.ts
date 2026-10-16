import { signOut, signOutBody } from '@/server/auth/flow';
import { withAuthRoute } from '@/server/auth/guard';

/** POST { scope?: 'local' | 'global' }. 'global' ends every session of this account ("sign out everywhere"). */
export default withAuthRoute(['POST'], async (req, res, supabase) => {
  const body = signOutBody.safeParse(req.body ?? {});
  if (!body.success) return res.status(400).json({ error: 'invalid_request' });
  await signOut(supabase, body.data.scope);
  res.status(200).json({ ok: true });
});
