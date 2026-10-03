import { applicationView, decideReferred } from '@sahel/domain';
import { jsonBody, ok, originations } from '@/lib/api';
import { auditLog, withStaff } from '@/lib/backoffice-api';

/**
 * POST /api/v1/backoffice/applications/{id}/decision { outcome: APPROVED | DECLINED, note }: a credit officer
 * decides a referred application. The note is mandatory and internal (audit log only). Repeating the same
 * decision returns the original result; a different one on a decided application is 409 NOT_REFERRED.
 */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withStaff(req, 'applications.decide', async (staff) => {
    const { id } = await ctx.params;
    const body = await jsonBody<{ outcome?: unknown; note?: unknown }>(req);
    const r = decideReferred(staff, originations, auditLog, id, body);
    return ok({ application: applicationView(r.application), audit: r.audit, replayed: r.replayed });
  });
}
