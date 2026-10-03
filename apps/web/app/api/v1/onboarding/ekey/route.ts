import { simulateEKeyLogin, withIdentity } from '@sahel/domain';
import { jsonBody, ok } from '@/lib/api';
import { withCustomer } from '@/lib/session';

/**
 * POST /api/v1/onboarding/ekey: "Log in with eKey".
 * ⚠️ SANDBOX: no call to the real eKey 2.0 (iGA). Any valid 9-digit CPR returns a fictional, verified
 * identity, kept in the customer session (masked CPR only) so the pre-approval is in that person's name.
 * The full CPR is never echoed back or stored, only the masked form (last 3 digits).
 */
export function POST(req: Request) {
  return withCustomer(req, async (s) => {
    const body = await jsonBody<{ cpr?: unknown }>(req);
    const identity = simulateEKeyLogin(typeof body.cpr === 'string' ? body.cpr : '');
    s.update((p) => withIdentity(p, identity));
    return ok(identity);
  });
}
