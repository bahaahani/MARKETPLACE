import { dealerSession, handleError, jsonBody, ok, preApprovalTokens, problem, rateLimit } from '@/lib/api';

/** POST /api/v1/dealer/preapproval/redeem { sellerId, token }: the customer's minimal pre-approval summary. */
export async function POST(req: Request) {
  try {
    rateLimit(req, 'share-redeem:ip');
    const body = await jsonBody<{ sellerId?: string; token?: string }>(req, { maxBytes: 1024 });
    if (!body.sellerId || typeof body.token !== 'string') return problem(400, 'BAD_REQUEST', 'sellerId and token are required');
    dealerSession(req, body.sellerId);
    return ok(preApprovalTokens.redeem(body.token));
  } catch (e) {
    return handleError(e);
  }
}
