import type { ClaimSeverity, ClaimStatus, ClaimType } from '@sahel/domain';
import type { MessageKey } from '@sahel/i18n';

/** Message keys for claim enums and errors, usable from server and client components. */
export const CLAIM_TYPE_LABEL: Record<ClaimType, MessageKey> = {
  collision: 'claimTypeCollision',
  theft: 'claimTypeTheft',
  glass: 'claimTypeGlass',
  fire: 'claimTypeFire',
  other: 'claimTypeOther',
};

export const CLAIM_SEVERITY_LABEL: Record<ClaimSeverity, MessageKey> = {
  minor: 'claimSeverityMinor',
  moderate: 'claimSeverityModerate',
  severe: 'claimSeveritySevere',
};

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, MessageKey> = {
  SUBMITTED: 'claimStatusSubmitted',
  UNDER_ASSESSMENT: 'claimStatusUnderAssessment',
  APPROVED: 'claimStatusApproved',
  REJECTED: 'claimStatusRejected',
  REPAIR_BOOKED: 'claimStatusRepairBooked',
  SETTLED: 'claimStatusSettled',
};

/** Pill colors per status. */
export const CLAIM_STATUS_TONE: Record<ClaimStatus, string> = {
  SUBMITTED: 'bg-brand-soft text-brand',
  UNDER_ASSESSMENT: 'bg-accent/15 text-[#8a5c00]',
  APPROVED: 'bg-islamic-soft text-islamic',
  REJECTED: 'bg-danger/10 text-danger',
  REPAIR_BOOKED: 'bg-islamic-soft text-islamic',
  SETTLED: 'bg-background text-text-muted',
};

/** Localized message for an API error code from POST /claims. */
export function claimErrorKey(code: string | undefined): MessageKey {
  switch (code) {
    case 'INCIDENT_IN_FUTURE':
      return 'claimErrorFuture';
    case 'INCIDENT_OUTSIDE_POLICY':
      return 'claimErrorOutsidePolicy';
    case 'INCIDENT_TOO_OLD':
      return 'claimErrorTooOld';
    case 'INVALID_INCIDENT_TIME':
      return 'claimErrorTime';
    case 'POLICE_REPORT_REQUIRED':
    case 'INVALID_POLICE_REPORT':
      return 'claimErrorPoliceReport';
    case 'PHOTOS_REQUIRED':
      return 'claimErrorPhotosRequired';
    case 'PHOTO_INVALID':
    case 'PHOTO_TOO_LARGE':
    case 'BODY_TOO_LARGE':
      return 'claimErrorPhoto';
    case 'TOO_MANY_PHOTOS':
      return 'claimErrorTooManyPhotos';
    case 'NOT_COVERED':
      return 'claimErrorNotCovered';
    case 'INVALID_LOCATION':
      return 'claimErrorLocation';
    case 'INVALID_DESCRIPTION':
      return 'claimErrorDescription';
    case 'POLICY_NOT_FOUND':
    case 'POLICY_NOT_ACTIVE':
    case 'NOT_MOTOR_POLICY':
      return 'claimErrorPolicy';
    default:
      return 'errorGeneric';
  }
}
