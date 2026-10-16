import { codeBody, verifyCode } from '@/server/auth/flow';
import { withAuthRoute } from '@/server/auth/guard';

const STATUS = { ok: 200, invalid_code: 400, unauthenticated: 401, forbidden: 403 } as const;

/** POST { code } → 200 once the session is AAL2 and belongs to the owner. Step 2 of 2. */
export default withAuthRoute(['POST'], async (req, res, supabase) => {
  const body = codeBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'invalid_code' });
  const result = await verifyCode(supabase, body.data.code);
  res.status(STATUS[result]).json(result === 'ok' ? { ok: true } : { error: result });
});
