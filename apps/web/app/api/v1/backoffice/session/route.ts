import { isStaffRole, SANDBOX_STAFF } from '@sahel/domain';
import { jsonBody, ok, problem } from '@/lib/api';
import { auditLog, STAFF_COOKIE, staffSession } from '@/lib/backoffice-api';
import { handleBackOfficeError } from '@/lib/backoffice-errors';

// Per staff session, so never cache.
export const dynamic = 'force-dynamic';

function cookie(req: Request, value: string, maxAge?: number): string {
  const secure = new URL(req.url).protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https' ? '; Secure' : '';
  return `${STAFF_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict${maxAge !== undefined ? `; Max-Age=${maxAge}` : ''}${secure}`;
}

/** GET /api/v1/backoffice/session: the signed-in staff member and role (401 when not signed in). */
export function GET(req: Request) {
  try {
    return ok(staffSession(req));
  } catch (e) {
    return handleBackOfficeError(e);
  }
}

/**
 * POST /api/v1/backoffice/session { role }: ⚠️ sandbox sign-in as a role (credit_officer, operations, compliance).
 * Sets the HttpOnly `sahel_staff` cookie and records STAFF_SIGNED_IN in the audit log. Production: staff SSO.
 */
export async function POST(req: Request) {
  try {
    const body = await jsonBody<{ role?: unknown }>(req);
    if (!isStaffRole(body.role)) return problem(400, 'BAD_REQUEST', 'role must be credit_officer, operations or compliance');
    const staff = SANDBOX_STAFF[body.role];
    auditLog.append(staff, { type: 'STAFF_SIGNED_IN' });
    const res = ok(staff);
    res.headers.append('Set-Cookie', cookie(req, body.role));
    return res;
  } catch (e) {
    return handleBackOfficeError(e);
  }
}

/** DELETE /api/v1/backoffice/session: sign out (clears the cookie). */
export function DELETE(req: Request) {
  const res = ok({ signedOut: true });
  res.headers.append('Set-Cookie', cookie(req, '', 0));
  return res;
}
