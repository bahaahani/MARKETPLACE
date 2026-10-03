import type { InsuranceLine, PolicyStatus, PropertyType, TravelRegion, TravelTier } from '@sahel/domain';
import type { MessageKey } from '@sahel/i18n';

/** Message keys for insurance enums, usable from server and client components. */
export const LINE_LABEL: Record<InsuranceLine, MessageKey> = { motor: 'insLineMotor', travel: 'insLineTravel', home: 'insLineHome' };

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
    default:
      return 'errorGeneric';
  }
}
