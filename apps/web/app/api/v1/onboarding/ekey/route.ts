import { simulateEKeyLogin } from '@sahel/domain';
import { handleError, jsonBody, ok } from '@/lib/api';

/**
 * POST /api/v1/onboarding/ekey: "Log in with eKey".
 * ⚠️ SANDBOX: no call to the real eKey 2.0 (iGA). Any valid 9-digit CPR returns a fictional, verified
 * identity. The full CPR is never echoed back, only the masked form (last 3 digits).
 */
export async function POST(req: Request) {
  try {
    const body = await jsonBody<{ cpr?: unknown }>(req);
    return ok(simulateEKeyLogin(typeof body.cpr === 'string' ? body.cpr : ''));
  } catch (e) {
    return handleError(e);
  }
}
