import type { ApplicationStatus, FinanceStructure } from '@sahel/domain';
import type { MessageKey } from '@sahel/i18n';

/** Message keys for domain enums, usable from server and client components. */
export const STRUCTURE_LABEL: Record<FinanceStructure, MessageKey> = {
  conventional: 'structureConventional',
  murabaha: 'structureMurabaha',
  ijara: 'structureIjara',
};

export const STATUS_LABEL: Record<ApplicationStatus, MessageKey> = {
  DRAFT: 'statusDraft',
  SUBMITTED: 'statusSubmitted',
  APPROVED: 'statusApproved',
  REFERRED: 'statusReferred',
  DECLINED: 'statusDeclined',
  OFFER_ACCEPTED: 'statusOfferAccepted',
  CONTRACT_SIGNED: 'statusContractSigned',
  ASSET_PURCHASED_BY_BCFC: 'statusAssetPurchased',
  OWNERSHIP_TRANSFERRED_TO_BCFC: 'statusOwnershipTransferred',
  SALE_TO_CUSTOMER: 'statusSaleToCustomer',
  DISBURSED: 'statusDisbursed',
  COMPLETED: 'statusCompleted',
};
