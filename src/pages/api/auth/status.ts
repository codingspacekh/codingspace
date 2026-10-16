import { currentStep } from '@/server/auth/flow';
import { withAuthRoute } from '@/server/auth/guard';

/** GET → { step }: where the sign-in page should start for this browser's session. */
export default withAuthRoute(['GET'], async (_req, res, supabase) => {
  res.status(200).json({ step: await currentStep(supabase) });
});
