import { passwordBody, signInWithPassword } from '@/server/auth/flow';
import { withAuthRoute } from '@/server/auth/guard';

/** POST { email, password } → { step: 'enroll' | 'verify' }. Step 1 of 2: no admin access yet (AAL1). */
export default withAuthRoute(['POST'], async (req, res, supabase) => {
  const body = passwordBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'invalid_request' });
  const result = await signInWithPassword(supabase, body.data);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.status === 429 ? 'rate_limited' : 'invalid_credentials' });
  }
  res.status(200).json({ step: result.step });
});
