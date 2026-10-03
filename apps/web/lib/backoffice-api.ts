import { cookies } from 'next/headers';
import {
  assertPermission,
  AuditLog,
  SandboxStaffAuth,
  type BackOfficePermission,
  type PolicyBoundCheck,
  type StaffAuthProvider,
  type StaffSession,
} from '@sahel/domain';
import { handleBackOfficeError } from './backoffice-errors';
import { policyStore } from './policy-store';
import { sessions } from './session';

/**
 * ⚠️ SANDBOX back-office (staff) session, standing in for staff SSO.
 *
 * The person picks a role on /{locale}/backoffice; the role is kept in an HttpOnly cookie (`sahel_staff`).
 * API clients may send the `X-Sahel-Staff-Role` header instead. Production: staff SSO (OIDC) with the role in the
 * token claims; only `staffAuth` below changes, because every back-office route goes through staffSession().
 */
export const STAFF_COOKIE = 'sahel_staff';
export const STAFF_ROLE_HEADER = 'X-Sahel-Staff-Role';

/** ⚠️ Sandbox: anyone can act in any role. Production swaps in a provider that verifies staff-SSO tokens. */
const staffAuth: StaffAuthProvider = new SandboxStaffAuth();

function cookieValue(header: string | null, name: string): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

/**
 * THE back-office auth check: resolves the staff session of a request (401 UNAUTHENTICATED without one) and,
 * with `permission`, checks the role has it (403 FORBIDDEN otherwise). Every /backoffice endpoint calls this.
 */
export function staffSession(req: Request, permission?: BackOfficePermission): StaffSession {
  const bearer = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? null;
  const role = req.headers.get(STAFF_ROLE_HEADER) ?? cookieValue(req.headers.get('cookie'), STAFF_COOKIE) ?? null;
  const session = staffAuth.authenticate({ role, bearer });
  if (permission) assertPermission(session, permission);
  return session;
}

/** The staff session of a server-rendered back-office page (from the cookie), or undefined when not signed in. */
export async function pageStaffSession(): Promise<StaffSession | undefined> {
  const role = (await cookies()).get(STAFF_COOKIE)?.value ?? null;
  try {
    return staffAuth.authenticate({ role });
  } catch {
    return undefined;
  }
}

/** Runs a back-office handler behind staffSession(); errors become problem responses (401 / 403 / 404 / 409 / 422). */
export async function withStaff(
  req: Request,
  permission: BackOfficePermission,
  handler: (staff: StaffSession) => Response | Promise<Response>,
): Promise<Response> {
  try {
    return await handler(staffSession(req, permission));
  } catch (e) {
    return handleBackOfficeError(e);
  }
}

const g = globalThis as unknown as { __sahelAudit?: AuditLog };
/** ⚠️ Sandbox audit log of back-office actions: append-only, in memory (lost on restart). */
export const auditLog = (g.__sahelAudit ??= new AuditLog());

/** A premium is bound when its customer's policies include one paid by it. */
export const isPolicyBound: PolicyBoundCheck = (payment, ownerId) =>
  ownerId !== undefined && policyStore.list(ownerId).some((p) => p.paymentId === payment.id);

/** The applicant's sandbox profile (name, masked CPR) while their session is alive. */
export const profileOf = (customerId: string) => sessions.profileOf(customerId);
