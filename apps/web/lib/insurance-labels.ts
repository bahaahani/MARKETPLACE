import type { InsuranceLine, MedicalNationality, MedicalTier, PolicyStatus, PropertyType, TravelRegion, TravelTier } from '@sahel/domain';
import type { MessageKey } from '@sahel/i18n';

/** Message keys for insurance enums, usable from server and client components. */
export const LINE_LABEL: Record<InsuranceLine, MessageKey> = { motor: 'insLineMotor', travel: 'insLineTravel', home: 'insLineHome', medical: 'insMedLine', life: 'insLifeLine' };

export const REGION_LABEL: Record<TravelRegion, MessageKey> = {
  gcc: 'insRegionGcc',
  'worldwide-excl-us-ca': 'insRegionWorldwideExclUsCa',
  worldwide: 'insRegionWorldwide',
};

export const TIER_LABEL: Record<TravelTier, MessageKey> = { basic: 'insTierBasic', plus: 'insTierPlus' };

export const HOME_TYPE_LABEL: Partial<Record<PropertyType, MessageKey>> = {
  villa: 'insTypeVilla',
  apartment: 'insTypeApartment',
  townhouse: 'insTypeTownhouse',
  office: 'insTypeOffice',
};

export const MEDICAL_TIER_LABEL: Record<MedicalTier, MessageKey> = { basic: 'insMedTierBasic', enhanced: 'insMedTierEnhanced', premium: 'insMedTierPremium' };

export const MEDICAL_NATIONALITY_LABEL: Record<MedicalNationality, MessageKey> = { bahraini: 'insMedBahraini', expat: 'insMedExpat' };

export const POLICY_STATUS_LABEL: Record<PolicyStatus, MessageKey> = { ACTIVE: 'insPolicyActive', EXPIRED: 'insPolicyExpired' };

/** Localized message for an API error code from the insurance endpoints. */
export function insuranceErrorKey(code: string | undefined): MessageKey {
  switch (code) {
    case 'INVALID_DATES':
      return 'insErrorDates';
    case 'TRIP_TOO_LONG':
      return 'insErrorTripTooLong';
    case 'INVALID_TRAVELLERS':
      return 'insErrorTravellers';
    case 'INVALID_SUM_INSURED':
      return 'insErrorSumInsured';
    case 'PROPERTY_NOT_INSURABLE':
      return 'insErrorNotInsurable';
    case 'INVALID_MEMBERS':
      return 'insMedErrorMembers';
    case 'REFERRED_TO_INSURER':
      return 'insMedReferred';
    case 'INVALID_AGE':
      return 'insLifeErrorAge';
    case 'INVALID_SUM_ASSURED':
      return 'insLifeErrorSum';
    case 'INVALID_TERM':
      return 'insLifeErrorTerm';
    default:
      return 'errorGeneric';
  }
}
