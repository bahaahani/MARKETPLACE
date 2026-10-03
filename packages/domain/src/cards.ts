import type { Fils } from './money';
import { preApprove, type CustomerFinancials } from './affordability';
import { CARDS, findCard } from './catalog';
import type { CreditCardProduct, Localized } from './types';

/**
 * Instant IMTIAZ card application (journey J3).
 *
 * ⚠️ SANDBOX. No card processor or issuer is called. A "virtual card" here is only a display record:
 * a masked number (last 4 digits), an expiry and a status. A full PAN or CVV is NEVER generated,
 * stored or returned (PCI DSS: the real PAN stays with the processor and is shown only in its
 * secure card-details view). Wallet flags are illustrative until push provisioning
 * (Apple Pay / Google Pay / Samsung Pay) is integrated.
 */

export type CardDeclineReason = 'BELOW_MIN_SALARY' | 'NO_DBR_HEADROOM';

export type VirtualCardStatus = 'ACTIVE' | 'FROZEN' | 'CLOSED';

export interface WalletProvisioning {
  applePay: boolean;
  googlePay: boolean;
  samsungPay: boolean;
  /** ⚠️ Always true in the prototype: provisioning is simulated. */
  sandbox: true;
}

export interface VirtualCard {
  id: string;
  cardId: string;
  name: Localized;
  network: 'mastercard';
  /** Masked, Mastercard-style: "5xxx xxxx xxxx 1234". Only the last 4 digits are real data. */
  panMasked: string;
  last4: string;
  /** "MM/YY" */
  expiry: string;
  status: VirtualCardStatus;
  limitFils: Fils;
  issuedAt: string;
  gradient: [string, string];
  wallet: WalletProvisioning;
}

export type CardApplication =
  | { decision: 'APPROVED'; cardId: string; limitFils: Fils; virtualCard: VirtualCard }
  | { decision: 'DECLINED'; cardId: string; reason: CardDeclineReason };

export class CardApplicationError extends Error {
  constructor(
    public readonly code: 'CARD_NOT_FOUND' | 'INVALID_LAST4',
    message: string,
  ) {
    super(message);
    this.name = 'CardApplicationError';
  }
}

export interface ApplyOptions {
  now?: Date;
  /** Last 4 digits assigned by the (sandbox) issuer. Random when omitted. */
  last4?: string;
  /** Asks for less than the offered limit. */
  requestedLimitFils?: Fils;
  id?: string;
}

const CARD_VALIDITY_YEARS = 3;

export function maskPan(last4: string): string {
  if (!/^\d{4}$/.test(last4)) throw new CardApplicationError('INVALID_LAST4', 'last4 must be 4 digits');
  return `5xxx xxxx xxxx ${last4}`;
}

/** Limit a card can be issued with: the pre-approved card limit (0 for prepaid, which has no credit line). */
export function offeredCardLimit(card: CreditCardProduct, f: CustomerFinancials, now: Date = new Date()): Fils {
  if (card.tier === 'prepaid') return 0;
  return preApprove(f, now).cardLimitFils;
}

export type CardEligibility =
  | { eligible: true; offeredLimitFils: Fils }
  | { eligible: false; reason: CardDeclineReason; offeredLimitFils: Fils };

/**
 * Would an instant application for this card be approved for these financials? Same rules as applyForCard,
 * so the "Apply" button on web and mobile is enabled exactly when the API would approve.
 */
export function cardEligibility(card: CreditCardProduct, f: CustomerFinancials, now: Date = new Date()): CardEligibility {
  if (f.monthlySalaryFils < card.minSalaryFils) return { eligible: false, reason: 'BELOW_MIN_SALARY', offeredLimitFils: 0 };
  const offeredLimitFils = offeredCardLimit(card, f, now);
  if (card.tier !== 'prepaid' && offeredLimitFils <= 0) return { eligible: false, reason: 'NO_DBR_HEADROOM', offeredLimitFils: 0 };
  return { eligible: true, offeredLimitFils };
}

/** A card product plus the current customer's eligibility (GET /api/v1/cards). */
export type CardOffer = CreditCardProduct & {
  eligible: boolean;
  /** Why an instant application would be declined; null when eligible */
  ineligibleReason: CardDeclineReason | null;
  /** Limit the card would be issued with (0 for prepaid or when not eligible) */
  offeredLimitFils: Fils;
};

export function cardOffers(f: CustomerFinancials, now: Date = new Date()): CardOffer[] {
  return CARDS.map((card) => {
    const e = cardEligibility(card, f, now);
    return { ...card, eligible: e.eligible, ineligibleReason: e.eligible ? null : e.reason, offeredLimitFils: e.offeredLimitFils };
  });
}

/**
 * Decides an instant card application and, when approved, issues a sandbox virtual card.
 * Rules: salary must meet the card's minimum; credit cards need DBR headroom (pre-approved card limit > 0);
 * the limit never exceeds the pre-approved card limit. Prepaid cards need neither.
 * ⚠️ Indicative only. Real decisions come from the decision engine with CRB data.
 */
export function applyForCard(cardId: string, f: CustomerFinancials, opts: ApplyOptions = {}): CardApplication {
  const card = findCard(cardId);
  if (!card) throw new CardApplicationError('CARD_NOT_FOUND', `card ${cardId} not found`);
  const now = opts.now ?? new Date();
  const check = cardEligibility(card, f, now);
  if (!check.eligible) return { decision: 'DECLINED', cardId, reason: check.reason };
  const offered = check.offeredLimitFils;
  const requested = opts.requestedLimitFils;
  const limitFils = requested !== undefined && Number.isInteger(requested) && requested > 0 ? Math.min(requested, offered) : offered;
  const last4 = opts.last4 ?? String(Math.floor(Math.random() * 10_000)).padStart(4, '0');
  const exp = new Date(Date.UTC(now.getUTCFullYear() + CARD_VALIDITY_YEARS, now.getUTCMonth(), 1));
  const virtualCard: VirtualCard = {
    id: opts.id ?? `vc_sbx_${now.getTime().toString(36)}_${last4}`,
    cardId,
    name: card.name,
    network: 'mastercard',
    panMasked: maskPan(last4),
    last4,
    expiry: `${String(exp.getUTCMonth() + 1).padStart(2, '0')}/${String(exp.getUTCFullYear()).slice(-2)}`,
    status: 'ACTIVE',
    limitFils,
    issuedAt: now.toISOString(),
    gradient: card.gradient,
    wallet: { applePay: true, googlePay: true, samsungPay: true, sandbox: true },
  };
  return { decision: 'APPROVED', cardId, limitFils, virtualCard };
}

/**
 * In-memory sandbox issuer for the prototype: keeps the virtual cards issued in this server session,
 * per customer. A customer only ever sees their own cards. Applying again for a card that is already
 * active returns the same card.
 */
export class SandboxCardIssuer {
  private readonly cards: { customerId: string; card: VirtualCard }[] = [];

  apply(customerId: string, cardId: string, f: CustomerFinancials, opts: ApplyOptions = {}): CardApplication {
    const existing = this.list(customerId).find((c) => c.cardId === cardId && c.status === 'ACTIVE');
    if (existing) return { decision: 'APPROVED', cardId, limitFils: existing.limitFils, virtualCard: existing };
    const result = applyForCard(cardId, f, opts);
    if (result.decision === 'APPROVED') this.cards.push({ customerId, card: result.virtualCard });
    return result;
  }

  /** This customer's cards, oldest first. */
  list(customerId: string): VirtualCard[] {
    return this.cards.filter((c) => c.customerId === customerId).map((c) => c.card);
  }

  /** One of this customer's cards; undefined for another customer's card. */
  get(customerId: string, id: string): VirtualCard | undefined {
    return this.list(customerId).find((c) => c.id === id);
  }
}
