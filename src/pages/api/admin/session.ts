import { withOwner } from '@/server/auth/guard';

/** GET → the signed-in owner. The admin pages call it first; a 401 sends them to the sign-in page. */
export default withOwner(['GET'], async (_req, res, { owner }) => {
  res.status(200).json({ email: owner.email });
});
