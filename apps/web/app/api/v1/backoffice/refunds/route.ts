import { refundQueue } from '@sahel/domain';
import { ok, payments } from '@/lib/api';
import { isPolicyBound, withStaff } from '@/lib/backoffice-api';

// Live sandbox stores, so never cache.
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/backoffice/refunds: captured insurance premiums with no policy (payment data only), oldest first.
 * Operations and compliance.
 */
export function GET(req: Request) {
  return withStaff(req, 'refunds.read', (staff) => {
    const items = refundQueue(staff, payments.listAll(), isPolicyBound);
    return ok({ items, total: items.length, totalFils: items.reduce((s, r) => s + r.amountFils, 0) });
  });
}
