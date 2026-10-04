import type { BidCondition, BidExtra, BidInsurancePreference, BidRequestStatus, BidSort, BidStatus, BodyType, FuelType } from '@sahel/domain';
import type { MessageKey } from '@sahel/i18n';

/** Message keys for the "Bid For Me" enums, usable from server and client components. */
export const BID_BODY_LABEL: Record<BodyType | 'any', MessageKey> = {
  any: 'bidAny',
  sedan: 'bidBodySedan',
  suv: 'bidBodySuv',
  hatchback: 'bidBodyHatchback',
  pickup: 'bidBodyPickup',
  coupe: 'bidBodyCoupe',
};

export const BID_CONDITION_LABEL: Record<BidCondition, MessageKey> = {
  any: 'bidConditionAny',
  new: 'conditionNew',
  used: 'conditionUsed',
};

export const BID_FUEL_LABEL: Record<FuelType | 'any', MessageKey> = {
  any: 'bidAny',
  petrol: 'bidFuelPetrol',
  hybrid: 'bidFuelHybrid',
  electric: 'bidFuelElectric',
};

export const BID_INSURANCE_LABEL: Record<BidInsurancePreference, MessageKey> = {
  takaful: 'bidInsuranceTakaful',
  any: 'bidInsuranceAny',
  none: 'bidInsuranceNone',
};

export const BID_EXTRA_LABEL: Record<BidExtra, MessageKey> = {
  'service-1y': 'bidExtraService1y',
  'service-2y': 'bidExtraService2y',
  'service-3y': 'bidExtraService3y',
  'window-tint': 'bidExtraWindowTint',
  'extended-warranty': 'bidExtraExtendedWarranty',
  'free-registration': 'bidExtraFreeRegistration',
  'floor-mats': 'bidExtraFloorMats',
  'full-tank': 'bidExtraFullTank',
};

export const BID_SORT_LABEL: Record<BidSort, MessageKey> = {
  monthly: 'bidSortMonthly',
  total: 'bidSortTotal',
  extras: 'bidSortExtras',
};

export const BID_REQUEST_STATUS_LABEL: Record<BidRequestStatus, MessageKey> = {
  OPEN: 'bidStatusOpen',
  CLOSED: 'bidStatusClosed',
  CANCELLED: 'bidStatusCancelled',
  EXPIRED: 'bidStatusExpired',
};

export const BID_STATUS_LABEL: Record<BidStatus, MessageKey> = {
  ACTIVE: 'bidStatusOpen',
  ACCEPTED: 'bidStatusAccepted',
  LOST: 'bidStatusLost',
};

/** API error code → message (POST /requests and dealer bids). */
export const BID_ERROR_LABEL: Partial<Record<string, MessageKey>> = {
  OVER_BUDGET: 'bidErrorOverBudget',
  REQUEST_ALREADY_OPEN: 'bidErrorAlreadyOpen',
  NO_TRADE_IN: 'bidErrorNoTradeIn',
  OVER_MAX_MONTHLY: 'bidDealerErrorOverMonthly',
  DOWN_PAYMENT_TOO_LOW: 'bidDealerErrorDownPayment',
  DISCOUNT_TOO_HIGH: 'bidDealerErrorDiscount',
};

/** Date and time in Bahrain (Asia/Bahrain, UTC+3), e.g. for a request's expiry. */
export function bahrainDateTimeText(locale: 'en' | 'ar', iso: string): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-BH-u-nu-latn' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Bahrain',
  }).format(new Date(iso));
}
