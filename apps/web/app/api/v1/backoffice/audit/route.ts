import { auditEntries, AUDIT_TYPES, isAuditType } from '@sahel/domain';
import { ok, problem } from '@/lib/api';
import { auditLog, withStaff } from '@/lib/backoffice-api';

// Live sandbox store, so never cache.
export const dynamic = 'force-dynamic';

/** GET /api/v1/backoffice/audit?type=: back-office actions, newest first (compliance, read-only). */
export function GET(req: Request) {
  return withStaff(req, 'audit.read', (staff) => {
    const type = new URL(req.url).searchParams.get('type') || undefined;
    if (type !== undefined && !isAuditType(type)) return problem(400, 'BAD_REQUEST', `type must be one of ${AUDIT_TYPES.join(', ')}`);
    const items = auditEntries(staff, auditLog, type);
    return ok({ items, total: items.length });
  });
}
