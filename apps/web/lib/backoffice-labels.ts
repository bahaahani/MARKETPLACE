import type { AuditType, BackOfficePermission, DecisionReason, PaymentMethod, StaffRole } from '@sahel/domain';
import type { MessageKey } from '@sahel/i18n';

/** Message keys for back-office enums, usable from server and client components. */
export const ROLE_LABEL: Record<StaffRole, MessageKey> = {
  credit_officer: 'boRoleCreditOfficer',
  operations: 'boRoleOperations',
  compliance: 'boRoleCompliance',
};

export const ROLE_DESCRIPTION: Record<StaffRole, MessageKey> = {
  credit_officer: 'boRoleCreditOfficerDesc',
  operations: 'boRoleOperationsDesc',
  compliance: 'boRoleComplianceDesc',
};

export const AUDIT_LABEL: Record<AuditType, MessageKey> = {
  STAFF_SIGNED_IN: 'boAuditSignedIn',
  APPLICATION_APPROVED: 'boAuditApproved',
  APPLICATION_DECLINED: 'boAuditDeclined',
  PAYMENT_REFUNDED: 'boAuditRefunded',
};

export const REASON_LABEL: Record<DecisionReason, MessageKey> = {
  OK: 'boReasonOk',
  DBR_EXCEEDED: 'boReasonDbrExceeded',
  AMOUNT_ABOVE_PREAPPROVAL: 'boReasonAbovePreapproval',
  HIGH_DBR_UTILISATION: 'boReasonHighDbr',
};

export const METHOD_LABEL: Record<PaymentMethod, MessageKey> = {
  benefitpay: 'methodBenefitpay',
  apple_pay: 'methodApplePay',
  google_pay: 'methodGooglePay',
  samsung_pay: 'methodSamsungPay',
  click_to_pay: 'methodClickToPay',
  card: 'methodCard',
};

/** Back-office pages and the permission each needs to open (nav shows only what the role may open). */
export const BACKOFFICE_NAV: { path: string; label: MessageKey; permission: BackOfficePermission; testId: string }[] = [
  { path: '', label: 'boNavDashboard', permission: 'dashboard.read', testId: 'bo-nav-dashboard' },
  { path: '/credit', label: 'boNavCredit', permission: 'applications.read', testId: 'bo-nav-credit' },
  { path: '/refunds', label: 'boNavRefunds', permission: 'refunds.read', testId: 'bo-nav-refunds' },
  { path: '/audit', label: 'boNavAudit', permission: 'audit.read', testId: 'bo-nav-audit' },
];
