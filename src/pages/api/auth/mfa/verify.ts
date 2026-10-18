import { codeBody, verifyCode } from '@/server/auth/flow';
import { withAuthRoute } from '@/server/auth/guard';
import { recordFailure, RETRY_AFTER_SECONDS, tooManyFailures } from '@/server/auth/throttle';

const STATUS = { ok: 200, invalid_code: 400, unauthenticated: 401, forbidden: 403 } as const;

/**
 * POST { code } → 200 once the session is AAL2 and belongs to the owner. Step 2 of 2.
 * Wrong codes count against the visitor like wrong passwords (see sign-in).
 */
export default withAuthRoute(['POST'], async (req, res, supabase) => {
  const body = codeBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'invalid_code' });
  if (await tooManyFailures(req)) {
    res.setHeader('Retry-After', RETRY_AFTER_SECONDS);
    return res.status(429).json({ error: 'rate_limited' });
  }
  const result = await verifyCode(supabase, body.data.code);
  if (result === 'invalid_code') await recordFailure(req);
  res.status(STATUS[result]).json(result === 'ok' ? { ok: true } : { error: result });
});
