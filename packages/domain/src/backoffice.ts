import type { Fils } from './money';
import type { CustomerFinancials } from './affordability';
import { demoCustomer } from './account';
import type { CustomerProfile } from './customer';
import { bahrainToday } from './insurance-common';
import type {
  ApplicationStatus,
  CreditReview,
  DecisionReason,
  FinanceApplication,
  OriginationProductLine,
  OriginationStructure,
  SandboxOriginationService,
} from './origination';
import { applicationPricing } from './origination';
import type { Payment, PaymentMethod, SandboxPaymentGateway } from './payments';
import type { Localized } from './types';

/**
 * Back-office console (staff tool, web only): credit officer review of referred applications, refunds of
 * insurance premiums that never became a policy, the audit log, and KPIs.
 * ⚠️ SANDBOX: no staff login (anyone can pick a role), audit log in memory, refunds move no money.
 * Production: staff SSO (Entra ID / OIDC) with roles from token claims, an append-only audit store, Tap refunds.
 */

// ---------------------------------------------------------------------------------------------
// Staff session and roles

export type StaffRole = 'credit_officer' | 'operations' | 'compliance';
export const STAFF_ROLES: StaffRole[] = ['credit_officer', 'operations', 'compliance'];

export function isStaffRole(x: unknown): x is StaffRole {
  return typeof x === 'string' && (STAFF_ROLES as string[]).includes(x);
}

/** What a role may do. Every back-office route asks for exactly one permission. */
export type BackOfficePermission =
  | 'dashboard.read'
  | 'applications.read'
  | 'applications.decide'
  | 'refunds.read'
  | 'refunds.execute'
  | 'audit.read';

/**
 * Least privilege (⚠️ VERIFY with Compliance):
 * - Credit officer: the referred queue, with salary and obligations, and decides it.
 * - Operations: payment data only (refund queue, refunds). No applications, no customer financials.
 * - Compliance viewer: read-only everything (queue without salary / obligations, refunds, the audit log).
 * Every role sees the dashboard KPIs (aggregates, no personal data).
 */
export const ROLE_PERMISSIONS: Record<StaffRole, BackOfficePermission[]> = {
  credit_officer: ['dashboard.read', 'applications.read', 'applications.decide'],
  operations: ['dashboard.read', 'refunds.read', 'refunds.execute'],
  compliance: ['dashboard.read', 'applications.read', 'refunds.read', 'audit.read'],
};

export function can(role: StaffRole, permission: BackOfficePermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export interface StaffSession {
  staffId: string;
  staffName: string;
  role: StaffRole;
  /** True while there is no real login; the UI shows a ⚠️ sandbox notice. */
  sandbox: boolean;
}

export interface StaffCredentials {
  /** ⚠️ Sandbox only: the role the person picked. Ignored once SSO is live (the role comes from the token). */
  role?: string | null;
  /** Bearer token from staff SSO. Ignored in the sandbox. */
  bearer?: string | null;
}

/**
 * How a request becomes a staff session. Production: verify the staff-SSO token and read the staff id and
 * role from its claims. Every back-office endpoint goes through this (staffSession in apps/web/lib), so
 * swapping it in is one change.
 */
export interface StaffAuthProvider {
  authenticate(credentials: StaffCredentials): StaffSession;
}

/** ⚠️ Sandbox staff, one per role. */
export const SANDBOX_STAFF: Record<StaffRole, StaffSession> = {
  credit_officer: { staffId: 'stf_sbx_credit_1', staffName: 'Demo Credit Officer', role: 'credit_officer', sandbox: true },
  operations: { staffId: 'stf_sbx_ops_1', staffName: 'Demo Operations', role: 'operations', sandbox: true },
  compliance: { staffId: 'stf_sbx_compliance_1', staffName: 'Demo Compliance Viewer', role: 'compliance', sandbox: true },
};

/** ⚠️ Sandbox sign-in: anyone can act in any role. No role (or an unknown one) is not signed in. */
export class SandboxStaffAuth implements StaffAuthProvider {
  authenticate({ role }: StaffCredentials): StaffSession {
    if (!isStaffRole(role)) throw new BackOfficeError('UNAUTHENTICATED', 'staff sign-in required');
    return SANDBOX_STAFF[role];
  }
}

/** 403 unless the session's role has the permission. */
export function assertPermission(session: StaffSession, permission: BackOfficePermission): void {
  if (!can(session.role, permission)) throw new BackOfficeError('FORBIDDEN', `role ${session.role} cannot ${permission}`);
}

export type BackOfficeErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'INVALID_REQUEST'
  | 'NOTE_REQUIRED'
  | 'APPLICATION_NOT_FOUND'
  | 'NOT_REFERRED'
  | 'PAYMENT_NOT_FOUND'
  | 'NOT_REFUNDABLE'
  | 'POLICY_BOUND';

export const BACKOFFICE_ERROR_STATUS: Record<BackOfficeErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  INVALID_REQUEST: 400,
  NOTE_REQUIRED: 422,
  APPLICATION_NOT_FOUND: 404,
  NOT_REFERRED: 409,
  PAYMENT_NOT_FOUND: 404,
  NOT_REFUNDABLE: 409,
  POLICY_BOUND: 409,
};

export class BackOfficeError extends Error {
  constructor(
    public readonly code: BackOfficeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BackOfficeError';
  }
}

// ---------------------------------------------------------------------------------------------
// Audit log

export type AuditType = 'STAFF_SIGNED_IN' | 'APPLICATION_APPROVED' | 'APPLICATION_DECLINED' | 'PAYMENT_REFUNDED';
export const AUDIT_TYPES: AuditType[] = ['STAFF_SIGNED_IN', 'APPLICATION_APPROVED', 'APPLICATION_DECLINED', 'PAYMENT_REFUNDED'];

export function isAuditType(x: unknown): x is AuditType {
  return typeof x === 'string' && (AUDIT_TYPES as string[]).includes(x);
}

export interface AuditEntry {
  id: string;
  type: AuditType;
  /** ISO timestamp */
  at: string;
  staffId: string;
  staffName: string;
  role: StaffRole;
  subject?: { kind: 'application' | 'payment'; id: string };
  /** The staff member's note (mandatory for credit decisions). Internal: never shown to the customer. */
  note?: string;
  amountFils?: Fils;
}

/**
 * ⚠️ Sandbox audit log: append-only, in memory. Production: an append-only (WORM) store with retention set by
 * Compliance. There is no update or delete.
 */
export class AuditLog {
  private readonly entries: AuditEntry[] = [];
  private seq = 0;

  constructor(private readonly clock: () => Date = () => new Date()) {}

  append(session: StaffSession, entry: Pick<AuditEntry, 'type' | 'subject' | 'note' | 'amountFils'>): AuditEntry {
    const now = this.clock();
    const e: AuditEntry = {
      id: `aud_sbx_${now.getTime().toString(36)}_${(++this.seq).toString(36)}`,
      at: now.toISOString(),
      staffId: session.staffId,
      staffName: session.staffName,
      role: session.role,
      ...entry,
    };
    this.entries.push(Object.freeze(e));
    return e;
  }

  /** Newest first, optionally only one type. */
  list(type?: AuditType): AuditEntry[] {
    return this.entries.filter((e) => type === undefined || e.type === type).reverse();
  }

  /** The latest entry about this subject with one of these types. */
  findFor(kind: 'application' | 'payment', id: string, types: AuditType[]): AuditEntry | undefined {
    return this.list().find((e) => e.subject?.kind === kind && e.subject.id === id && types.includes(e.type));
  }
}

// ---------------------------------------------------------------------------------------------
// Credit review queue

/** Minimum characters for a credit officer's note. ⚠️ VERIFY with Credit Risk. */
export const MIN_DECISION_NOTE_LENGTH = 5;
export const MAX_NOTE_LENGTH = 1000;

export interface ReferredApplication {
  id: string;
  /** First name only (data minimization) */
  firstName: Localized;
  /** Masked CPR from eKey, when the customer logged in with eKey */
  cprMasked?: string;
  productLine: OriginationProductLine;
  structure: OriginationStructure;
  /** Vehicle id, property id (home finance), or "personal" */
  reference: string;
  financedFils: Fils;
  tenureMonths: number;
  monthlyFils: Fils;
  /** DBR after this facility (percent), as decided */
  dbrAfterPct: number | null;
  dbrCapPct: number;
  reasons: DecisionReason[];
  status: ApplicationStatus;
  /** When it was referred */
  referredAt: string;
  /** Vehicle applications priced from an accepted bid or a trade-in: list price versus the price financed */
  deal?: { fromBid: boolean; listPriceFils: Fils; priceFils: Fils; discountFils: Fils; tradeInCreditFils: Fils };
  /** Raw salary and obligations: credit officers only */
  financials?: CustomerFinancials & { maxMonthlyFils: Fils; preApprovedLimitFils: Fils };
}

function firstName(name: Localized): Localized {
  return { en: name.en.split(/\s+/)[0] ?? name.en, ar: name.ar.split(/\s+/)[0] ?? name.ar };
}

/**
 * One application as a back-office role may see it. Salary and obligations only for a role that can decide.
 * `profile` is the customer's sandbox profile (undefined once the session expired: the demo customer's name).
 */
export function referredApplicationView(app: FinanceApplication, role: StaffRole, profile?: CustomerProfile): ReferredApplication {
  const d = app.decision;
  const referredAt = app.timeline.find((e) => e.status === 'REFERRED')?.at ?? app.updatedAt;
  const name = profile?.identity?.name ?? demoCustomer().name;
  return {
    id: app.id,
    firstName: firstName(name),
    ...(profile?.identity?.cprMasked ? { cprMasked: profile.identity.cprMasked } : {}),
    productLine: app.productLine,
    structure: app.structure,
    reference: app.reference,
    financedFils: app.quote.financedFils,
    tenureMonths: app.quote.tenureMonths,
    monthlyFils: d?.monthlyFils ?? app.quote.monthlyFils,
    dbrAfterPct: d?.dbrAfterPct ?? null,
    dbrCapPct: d?.dbrCapPct ?? 0,
    reasons: d?.reasons ?? [],
    status: app.status,
    referredAt,
    ...(app.source || app.tradeIn
      ? (({ listPriceFils, priceFils, discountFils, tradeInCreditFils }) => ({
          deal: { fromBid: app.source !== undefined, listPriceFils, priceFils, discountFils, tradeInCreditFils },
        }))(applicationPricing(app))
      : {}),
    ...(can(role, 'applications.decide')
      ? {
          financials: {
            monthlySalaryFils: app.applicant.monthlySalaryFils,
            existingObligationsFils: app.applicant.existingObligationsFils,
            maxMonthlyFils: d?.maxMonthlyFils ?? 0,
            preApprovedLimitFils: d?.preApprovedLimitFils ?? 0,
          },
        }
      : {}),
  };
}

/** Every customer's REFERRED applications, oldest referral first (first in, first out). */
export function creditQueue(
  session: StaffSession,
  applications: FinanceApplication[],
  profileOf: (customerId: string) => CustomerProfile | undefined,
): ReferredApplication[] {
  assertPermission(session, 'applications.read');
  return applications
    .filter((a) => a.status === 'REFERRED')
    .map((a) => referredApplicationView(a, session.role, profileOf(a.customerId)))
    .sort((a, b) => a.referredAt.localeCompare(b.referredAt));
}

export interface CreditDecisionRequest {
  outcome: CreditReview['outcome'];
  note: string;
}

export function validateNote(note: unknown, required: boolean): string | undefined {
  if (note === undefined || note === null || note === '') {
    if (required) throw new BackOfficeError('NOTE_REQUIRED', `a note of at least ${MIN_DECISION_NOTE_LENGTH} characters is required`);
    return undefined;
  }
  if (typeof note !== 'string') throw new BackOfficeError('INVALID_REQUEST', 'note must be a string');
  const trimmed = note.trim();
  if (required && trimmed.length < MIN_DECISION_NOTE_LENGTH) {
    throw new BackOfficeError('NOTE_REQUIRED', `a note of at least ${MIN_DECISION_NOTE_LENGTH} characters is required`);
  }
  if (trimmed.length > MAX_NOTE_LENGTH) throw new BackOfficeError('INVALID_REQUEST', `note is longer than ${MAX_NOTE_LENGTH} characters`);
  return trimmed || undefined;
}

export interface CreditDecisionResult {
  application: FinanceApplication;
  audit: AuditEntry;
  /** true when this repeated an earlier identical decision (nothing changed, no new audit entry) */
  replayed: boolean;
}

/**
 * A credit officer approves or declines a REFERRED application with a mandatory note: REFERRED → APPROVED /
 * DECLINED (origination state machine) plus an audit entry (who, role, when, note).
 * Repeating the same decision returns the original result (idempotent); a different decision on an application
 * that is no longer REFERRED is 409 NOT_REFERRED.
 */
export function decideReferred(
  session: StaffSession,
  originations: SandboxOriginationService,
  audit: AuditLog,
  applicationId: string,
  req: { outcome?: unknown; note?: unknown },
): CreditDecisionResult {
  assertPermission(session, 'applications.decide');
  if (req.outcome !== 'APPROVED' && req.outcome !== 'DECLINED') throw new BackOfficeError('INVALID_REQUEST', 'outcome must be APPROVED or DECLINED');
  const note = validateNote(req.note, true)!;
  const app = originations.get(applicationId);
  if (!app) throw new BackOfficeError('APPLICATION_NOT_FOUND', `unknown application ${applicationId}`);
  if (app.status !== 'REFERRED') {
    const prior = audit.findFor('application', app.id, ['APPLICATION_APPROVED', 'APPLICATION_DECLINED']);
    if (app.review?.outcome === req.outcome && prior) return { application: app, audit: prior, replayed: true };
    throw new BackOfficeError('NOT_REFERRED', `application is ${app.status}, only REFERRED applications can be reviewed`);
  }
  const application = originations.review(app.id, req.outcome);
  const entry = audit.append(session, {
    type: req.outcome === 'APPROVED' ? 'APPLICATION_APPROVED' : 'APPLICATION_DECLINED',
    subject: { kind: 'application', id: app.id },
    note,
    amountFils: app.quote.financedFils,
  });
  return { application, audit: entry, replayed: false };
}

// ---------------------------------------------------------------------------------------------
// Refund queue: captured insurance premiums that never became a policy

/**
 * ⚠️ VERIFY with Operations: how long a captured premium may wait for its policy before it is refundable
 * (the app normally binds within seconds). Sandbox: 0, so the queue is testable immediately. Production: e.g. 30 minutes.
 */
export const ORPHAN_PREMIUM_MIN_AGE_MS = 0;

export interface RefundCandidate {
  paymentId: string;
  amountFils: Fils;
  method: PaymentMethod;
  /** The policy quote the premium was for */
  quoteId: string;
  capturedAt: string;
  /** Minutes since the payment was created */
  ageMinutes: number;
}

/** Is this payment bound to an issued policy? (the policy store, read by the caller for the payment's owner) */
export type PolicyBoundCheck = (payment: Payment, ownerId: string | undefined) => boolean;

function isOrphanPremium(p: Payment, ownerId: string | undefined, isBound: PolicyBoundCheck, now: Date, minAgeMs: number): boolean {
  return (
    p.purpose === 'insurance_premium' &&
    p.status === 'CAPTURED' &&
    now.getTime() - Date.parse(p.createdAt) >= minAgeMs &&
    !isBound(p, ownerId)
  );
}

/** Payment data only (no customer data): Operations works the queue. Oldest first. */
export function refundQueue(
  session: StaffSession,
  all: { payment: Payment; ownerId?: string }[],
  isBound: PolicyBoundCheck,
  now: Date = new Date(),
  minAgeMs: number = ORPHAN_PREMIUM_MIN_AGE_MS,
): RefundCandidate[] {
  assertPermission(session, 'refunds.read');
  return orphanPremiums(all, isBound, now, minAgeMs);
}

function orphanPremiums(all: { payment: Payment; ownerId?: string }[], isBound: PolicyBoundCheck, now: Date, minAgeMs: number): RefundCandidate[] {
  return all
    .filter(({ payment, ownerId }) => isOrphanPremium(payment, ownerId, isBound, now, minAgeMs))
    .map(({ payment: p }) => ({
      paymentId: p.id,
      amountFils: p.amountFils,
      method: p.method,
      quoteId: p.reference,
      capturedAt: p.createdAt,
      ageMinutes: Math.max(0, Math.floor((now.getTime() - Date.parse(p.createdAt)) / 60_000)),
    }))
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

export interface RefundResult {
  payment: Payment;
  audit: AuditEntry;
  /** true when the payment was already refunded (nothing changed, no new audit entry) */
  replayed: boolean;
}

/**
 * Operations refunds a captured premium that has no policy: CAPTURED → REFUNDED (payment state machine) plus an
 * audit entry. Re-checks the binding at refund time, so a policy issued meanwhile is never refunded (409
 * POLICY_BOUND). Idempotent: refunding again returns the original refund and its audit entry.
 */
export async function refundOrphanPremium(
  session: StaffSession,
  gateway: SandboxPaymentGateway,
  audit: AuditLog,
  paymentId: string,
  isBound: PolicyBoundCheck,
  opts: { note?: unknown; now?: Date; minAgeMs?: number } = {},
): Promise<RefundResult> {
  assertPermission(session, 'refunds.execute');
  const note = validateNote(opts.note, false);
  const found = gateway.listAll().find((x) => x.payment.id === paymentId);
  if (!found) throw new BackOfficeError('PAYMENT_NOT_FOUND', `unknown payment ${paymentId}`);
  const { payment, ownerId } = found;
  if (payment.purpose !== 'insurance_premium') throw new BackOfficeError('NOT_REFUNDABLE', `payment ${paymentId} is not an insurance premium`);
  if (payment.status === 'REFUNDED') {
    const prior = audit.findFor('payment', paymentId, ['PAYMENT_REFUNDED']);
    if (prior) return { payment, audit: prior, replayed: true };
  }
  if (isBound(payment, ownerId)) throw new BackOfficeError('POLICY_BOUND', `payment ${paymentId} is bound to a policy`);
  if (payment.status !== 'CAPTURED') throw new BackOfficeError('NOT_REFUNDABLE', `payment ${paymentId} is ${payment.status}, not CAPTURED`);
  const now = opts.now ?? new Date();
  if (now.getTime() - Date.parse(payment.createdAt) < (opts.minAgeMs ?? ORPHAN_PREMIUM_MIN_AGE_MS)) {
    throw new BackOfficeError('NOT_REFUNDABLE', `payment ${paymentId} may still be bound to its policy; try later`);
  }
  const refunded = await gateway.refund(paymentId);
  const entry = audit.append(session, {
    type: 'PAYMENT_REFUNDED',
    subject: { kind: 'payment', id: paymentId },
    amountFils: refunded.amountFils,
    ...(note ? { note } : {}),
  });
  return { payment: refunded, audit: entry, replayed: false };
}

// ---------------------------------------------------------------------------------------------
// Audit view and KPIs

export function auditEntries(session: StaffSession, audit: AuditLog, type?: AuditType): AuditEntry[] {
  assertPermission(session, 'audit.read');
  return audit.list(type);
}

export interface BackOfficeKpis {
  /** Bahrain calendar date the "today" figures are for (YYYY-MM-DD) */
  date: string;
  /** Applications created today, by current status (only statuses that occur) */
  applicationsToday: Partial<Record<ApplicationStatus, number>>;
  applicationsTodayTotal: number;
  /** Approved / (approved + declined) among today's decided applications, percent (1 decimal); null if none decided */
  approvalRatePct: number | null;
  /** Average time from submission to the final decision (approve / decline) today, minutes (1 decimal); null if none */
  avgDecisionMinutes: number | null;
  /** Average time a referred application waited for a credit officer, today's reviews, minutes (1 decimal); null if none */
  avgReviewMinutes: number | null;
  /** Referred applications waiting for a credit officer (all days) */
  referredPending: number;
  /** Captured premiums without a policy, waiting for a refund */
  refundsPending: number;
  refundsPendingFils: Fils;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
const minutesBetween = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 60_000;

/** Dashboard KPIs: aggregates only, no personal data, so every role may see them. */
export function backOfficeKpis(
  session: StaffSession,
  applications: FinanceApplication[],
  payments: { payment: Payment; ownerId?: string }[],
  isBound: PolicyBoundCheck,
  now: Date = new Date(),
): BackOfficeKpis {
  assertPermission(session, 'dashboard.read');
  const date = bahrainToday(now);
  const today = applications.filter((a) => bahrainToday(new Date(a.createdAt)) === date);
  const applicationsToday: Partial<Record<ApplicationStatus, number>> = {};
  for (const a of today) applicationsToday[a.status] = (applicationsToday[a.status] ?? 0) + 1;

  const finalAt = (a: FinanceApplication) => a.timeline.find((e) => e.status === 'APPROVED' || e.status === 'DECLINED');
  const decided = today.filter((a) => finalAt(a));
  const approved = decided.filter((a) => finalAt(a)!.status === 'APPROVED').length;
  const decisionMinutes = decided.map((a) => {
    const submitted = a.timeline.find((e) => e.status === 'SUBMITTED')?.at ?? a.createdAt;
    return minutesBetween(submitted, finalAt(a)!.at);
  });
  const reviewMinutes = applications
    .filter((a) => a.review && bahrainToday(new Date(a.review.reviewedAt)) === date)
    .map((a) => minutesBetween(a.timeline.find((e) => e.status === 'REFERRED')?.at ?? a.createdAt, a.review!.reviewedAt));
  const refunds = orphanPremiums(payments, isBound, now, ORPHAN_PREMIUM_MIN_AGE_MS);

  return {
    date,
    applicationsToday,
    applicationsTodayTotal: today.length,
    approvalRatePct: decided.length ? round1((approved * 100) / decided.length) : null,
    avgDecisionMinutes: avg(decisionMinutes),
    avgReviewMinutes: avg(reviewMinutes),
    referredPending: applications.filter((a) => a.status === 'REFERRED').length,
    refundsPending: refunds.length,
    refundsPendingFils: refunds.reduce((s, r) => s + r.amountFils, 0),
  };
}
