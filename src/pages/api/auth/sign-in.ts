import { passwordBody, signInWithPassword } from '@/server/auth/flow';
import { withAuthRoute } from '@/server/auth/guard';
import { recordFailure, RETRY_AFTER_SECONDS, tooManyFailures } from '@/server/auth/throttle';

/**
 * POST { email, password } → { step: 'enroll' | 'verify' }. Step 1 of 2: no admin access yet (AAL1).
 * A visitor with too many recent wrong passwords or codes gets 429 before Supabase is asked.
 */
export default withAuthRoute(['POST'], async (req, res, supabase) => {
  const body = passwordBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'invalid_request' });
  if (await tooManyFailures(req)) {
    res.setHeader('Retry-After', RETRY_AFTER_SECONDS);
    return res.status(429).json({ error: 'rate_limited' });
  }
  const result = await signInWithPassword(supabase, body.data);
  if (!result.ok) {
    if (result.status === 401) await recordFailure(req);
    return res.status(result.status).json({ error: result.status === 429 ? 'rate_limited' : 'invalid_credentials' });
  }
  res.status(200).json({ step: result.step });
});
