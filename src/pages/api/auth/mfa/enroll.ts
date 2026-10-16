import { startEnrolment } from '@/server/auth/flow';
import { withAuthRoute } from '@/server/auth/guard';

/** POST → { factorId, qr, secret }. Only for a password session with no verified authenticator yet. */
export default withAuthRoute(['POST'], async (_req, res, supabase) => {
  const enrolment = await startEnrolment(supabase);
  if (enrolment === 'not_allowed') return res.status(409).json({ error: 'not_allowed' });
  res.status(200).json(enrolment);
});
