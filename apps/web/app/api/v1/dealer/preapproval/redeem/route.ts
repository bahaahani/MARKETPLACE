import { dealerSession, handleError, ok, preApprovalTokens, problem } from '@/lib/api';

/** POST /api/v1/dealer/preapproval/redeem { sellerId, token }: the customer's minimal pre-approval summary. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { sellerId?: string; token?: string };
    if (!body.sellerId || typeof body.token !== 'string') return problem(400, 'BAD_REQUEST', 'sellerId and token are required');
    dealerSession(req, body.sellerId);
    return ok(preApprovalTokens.redeem(body.token));
  } catch (e) {
    return handleError(e);
  }
}
