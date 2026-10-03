import { creditQueue } from '@sahel/domain';
import { ok, originations } from '@/lib/api';
import { profileOf, withStaff } from '@/lib/backoffice-api';

// Live sandbox stores, so never cache.
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/backoffice/applications: REFERRED applications of every customer, oldest referral first.
 * Credit officers and compliance; salary and obligations only for credit officers.
 */
export function GET(req: Request) {
  return withStaff(req, 'applications.read', (staff) => {
    const items = creditQueue(staff, originations.listAll(), profileOf);
    return ok({ items, total: items.length });
  });
}
