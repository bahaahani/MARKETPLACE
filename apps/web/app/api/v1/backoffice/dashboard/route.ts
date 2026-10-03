import { backOfficeKpis } from '@sahel/domain';
import { ok, originations, payments } from '@/lib/api';
import { isPolicyBound, withStaff } from '@/lib/backoffice-api';

// Live sandbox stores, so never cache.
export const dynamic = 'force-dynamic';

/** GET /api/v1/backoffice/dashboard: KPIs (aggregates only, every staff role). */
export function GET(req: Request) {
  return withStaff(req, 'dashboard.read', (staff) => ok(backOfficeKpis(staff, originations.listAll(), payments.listAll(), isPolicyBound)));
}
