import { isLeadStatus } from '@sahel/domain';
import { dealerSession, handleError, leads, ok, problem } from '@/lib/api';

type Ctx = { params: Promise<{ sellerId: string; leadId: string }> };

/** GET /api/v1/dealer/{sellerId}/leads/{leadId} */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const { sellerId, leadId } = await ctx.params;
    dealerSession(req, sellerId);
    return ok(leads.get(sellerId, leadId));
  } catch (e) {
    return handleError(e);
  }
}

/** PATCH /api/v1/dealer/{sellerId}/leads/{leadId} { status }: move a lead along the pipeline (409 if not allowed). */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { sellerId, leadId } = await ctx.params;
    dealerSession(req, sellerId);
    const body = (await req.json()) as { status?: unknown };
    if (!isLeadStatus(body.status)) {
      return problem(400, 'BAD_REQUEST', 'status must be one of NEW, CONTACTED, TEST_DRIVE, OFFER_SENT, WON, LOST');
    }
    return ok(leads.updateStatus(sellerId, leadId, body.status));
  } catch (e) {
    return handleError(e);
  }
}
