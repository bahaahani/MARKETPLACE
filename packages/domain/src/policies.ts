import type { Fils } from './money';
import type { Localized, PropertyType } from './types';
import type { Payment } from './payments';
import { motorQuotes, type MotorCover } from './insurance';
import { bahrainToday, InsuranceQuoteError, oneYearEndIso, type InsuranceLine, INSURANCE_LINES, isSafeNonNegativeInt } from './insurance-common';
import { DEMO_TRAVEL_PLANS, travelPremium, travelQuotes, withTravelDefaults, type TravelQuoteInput, type TravelRegion, type TravelTier } from './insurance-travel';
import { homeQuotes, type HomeQuoteInput } from './insurance-home';
import { DEMO_INSURERS } from './insurance';

/**
 * Buying a policy (sandbox). The premium is never taken from the client:
 * 1. POST /policies/quotes: the server re-prices the chosen insurer and holds a policy quote (id `pq_…`).
 * 2. The client pays it through the normal checkout (purpose `insurance_premium`, reference = the quote id).
 * 3. POST /policies/confirm with the payment id: the policy is issued only if that payment is CAPTURED,
 *    is an insurance premium for this exact quote, and its amount equals the held premium.
 * ⚠️ Production: the insurer's API issues the policy number and document; the Tap webhook confirms the payment.
 */

/** ⚠️ VERIFY: how long a held quote can be paid for. */
export const POLICY_QUOTE_TTL_MS = 24 * 60 * 60 * 1000;

export type PolicyCover =
  | { line: 'motor'; cover: MotorCover; vehicleValueFils: Fils; agencyRepair: boolean; reference: string }
  | { line: 'travel'; region: TravelRegion; tier: TravelTier; adults: number; children: number; days: number; medicalCoverFils: Fils }
  | {
      line: 'home';
      propertyType: PropertyType;
      buildingSumInsuredFils: Fils;
      contentsSumInsuredFils: Fils;
      propertyId?: string;
      propertyTitle?: Localized;
    };

export type PolicyQuoteRequest =
  | { line: 'motor'; insurerId: string; input: { vehicleValueFils: Fils; cover: MotorCover; agencyRepair?: boolean; reference: string } }
  | { line: 'travel'; insurerId: string; input: Partial<TravelQuoteInput> }
  | { line: 'home'; insurerId: string; input: Partial<HomeQuoteInput> };

/** A priced offer from one insurer, held so it can be paid and bound. */
export interface PolicyQuote {
  id: string;
  customerId: string;
  line: InsuranceLine;
  insurerId: string;
  insurerName: Localized;
  takaful: boolean;
  premiumFils: Fils;
  cover: PolicyCover;
  startDate: string;
  endDate: string;
  createdAt: string;
  expiresAt: string;
  /** Set once a policy was issued from this quote */
  policyId?: string;
}

export type PolicyStatus = 'ACTIVE' | 'EXPIRED';

export interface Policy {
  id: string;
  policyNumber: string;
  customerId: string;
  line: InsuranceLine;
  insurerId: string;
  insurerName: Localized;
  takaful: boolean;
  premiumFils: Fils;
  cover: PolicyCover;
  /** First and last day covered (YYYY-MM-DD, inclusive) */
  startDate: string;
  endDate: string;
  /** Derived from the dates on every read: EXPIRED after endDate (Bahrain date) */
  status: PolicyStatus;
  quoteId: string;
  paymentId: string;
  issuedAt: string;
}

export type PolicyErrorCode =
  | 'INVALID_REQUEST'
  | 'INSURER_NOT_FOUND'
  | 'QUOTE_NOT_FOUND'
  | 'QUOTE_EXPIRED'
  | 'PAYMENT_NOT_FOUND'
  | 'PAYMENT_NOT_CAPTURED'
  | 'PAYMENT_MISMATCH'
  | 'AMOUNT_MISMATCH'
  | 'ALREADY_BOUND';

/** Suggested HTTP status for each policy error. */
export const POLICY_ERROR_STATUS: Record<PolicyErrorCode, number> = {
  INVALID_REQUEST: 422,
  INSURER_NOT_FOUND: 422,
  QUOTE_NOT_FOUND: 404,
  QUOTE_EXPIRED: 410,
  PAYMENT_NOT_FOUND: 404,
  PAYMENT_NOT_CAPTURED: 409,
  PAYMENT_MISMATCH: 422,
  AMOUNT_MISMATCH: 422,
  ALREADY_BOUND: 409,
};

export class PolicyError extends Error {
  constructor(
    public readonly code: PolicyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PolicyError';
  }
}

const LINE_CODE: Record<InsuranceLine, string> = { motor: 'MTR', travel: 'TRV', home: 'HOM' };

export function policyStatus(endDate: string, now: Date = new Date()): PolicyStatus {
  return endDate < bahrainToday(now) ? 'EXPIRED' : 'ACTIVE';
}

/** Price one insurer for a request, re-using the comparison engines (the client's price is never trusted). */
export function pricePolicyQuote(
  req: PolicyQuoteRequest,
  now: Date = new Date(),
): Pick<PolicyQuote, 'line' | 'insurerId' | 'insurerName' | 'takaful' | 'premiumFils' | 'cover' | 'startDate' | 'endDate'> {
  if (typeof req !== 'object' || req === null || !INSURANCE_LINES.includes(req.line)) {
    throw new PolicyError('INVALID_REQUEST', `line must be one of ${INSURANCE_LINES.join(', ')}`);
  }
  if (typeof req.insurerId !== 'string' || !req.insurerId) throw new PolicyError('INVALID_REQUEST', 'insurerId is required');
  if (typeof req.input !== 'object' || req.input === null) throw new PolicyError('INVALID_REQUEST', 'input is required');
  const notOffered = () => new PolicyError('INSURER_NOT_FOUND', `${req.insurerId} does not offer ${req.line} cover`);
  const today = bahrainToday(now);

  switch (req.line) {
    case 'motor': {
      const { vehicleValueFils, cover, agencyRepair, reference } = req.input;
      if (!isSafeNonNegativeInt(vehicleValueFils) || vehicleValueFils <= 0) {
        throw new InsuranceQuoteError('INVALID_REQUEST', 'vehicleValueFils must be a positive integer');
      }
      if (cover !== 'comprehensive' && cover !== 'third-party') throw new InsuranceQuoteError('INVALID_REQUEST', 'cover must be comprehensive or third-party');
      if (typeof reference !== 'string' || !reference) throw new InsuranceQuoteError('INVALID_REQUEST', 'reference (plate or vehicle id) is required');
      const q = motorQuotes({ vehicleValueFils, cover, agencyRepair: agencyRepair === true }).find((x) => x.insurerId === req.insurerId);
      if (!q) throw notOffered();
      return {
        line: 'motor',
        insurerId: q.insurerId,
        insurerName: q.insurerName,
        takaful: q.takaful,
        premiumFils: q.annualPremiumFils,
        cover: { line: 'motor', cover, vehicleValueFils, agencyRepair: q.agencyRepair, reference },
        startDate: today,
        endDate: oneYearEndIso(today),
      };
    }
    case 'travel': {
      const q = travelQuotes({ ...withTravelDefaults(req.input), takafulOnly: false }, now).find((x) => x.insurerId === req.insurerId);
      if (!q) throw notOffered();
      return {
        line: 'travel',
        insurerId: q.insurerId,
        insurerName: q.insurerName,
        takaful: q.takaful,
        premiumFils: q.premiumFils,
        cover: { line: 'travel', region: q.region, tier: q.tier, adults: q.adults, children: q.children, days: q.days, medicalCoverFils: q.medicalCoverFils },
        startDate: q.startDate,
        endDate: q.endDate,
      };
    }
    case 'home': {
      const { input, quotes } = homeQuotes({ ...req.input, takafulOnly: false });
      const q = quotes.find((x) => x.insurerId === req.insurerId);
      if (!q) throw notOffered();
      return {
        line: 'home',
        insurerId: q.insurerId,
        insurerName: q.insurerName,
        takaful: q.takaful,
        premiumFils: q.annualPremiumFils,
        cover: {
          line: 'home',
          propertyType: input.propertyType,
          buildingSumInsuredFils: input.buildingSumInsuredFils,
          contentsSumInsuredFils: input.contentsSumInsuredFils,
          ...(input.propertyId ? { propertyId: input.propertyId, propertyTitle: input.propertyTitle } : {}),
        },
        startDate: today,
        endDate: oneYearEndIso(today),
      };
    }
  }
}

/**
 * In-memory sandbox policy store (like SandboxPaymentGateway). Production: the broker platform and insurer APIs.
 */
export class SandboxPolicyStore {
  private readonly quotes = new Map<string, PolicyQuote>();
  private readonly policies = new Map<string, Omit<Policy, 'status'>>();
  private readonly byPayment = new Map<string, string>();
  private readonly seeded = new Set<string>();
  private seq = 0;
  private issued = 0;

  /**
   * @param history policies a customer already has before buying anything (e.g. the demo history), added the
   *   first time that customer's policies are read or confirmed. Every sandbox session customer gets their own copy.
   */
  constructor(
    private readonly clock: () => Date = () => new Date(),
    private readonly history?: (customerId: string) => Omit<Policy, 'status'>[],
  ) {}

  /** Price and hold a quote for the customer. Throws InsuranceQuoteError / PolicyError for invalid requests. */
  createQuote(customerId: string, req: PolicyQuoteRequest): PolicyQuote {
    const now = this.clock();
    const priced = pricePolicyQuote(req, now);
    const id = `pq_sbx_${now.getTime().toString(36)}_${(++this.seq).toString(36)}`;
    const quote: PolicyQuote = {
      id,
      customerId,
      ...priced,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + POLICY_QUOTE_TTL_MS).toISOString(),
    };
    this.quotes.set(id, quote);
    return quote;
  }

  /** With `customerId`, only that customer's quote: another customer's id reads as undefined. */
  getQuote(id: string, customerId?: string): PolicyQuote | undefined {
    const q = this.quotes.get(id);
    return q && (customerId === undefined || q.customerId === customerId) ? q : undefined;
  }

  /**
   * Bind a captured payment to its quote and issue the policy. Rules, in order:
   * - the payment exists (PAYMENT_NOT_FOUND) and is an `insurance_premium` (PAYMENT_MISMATCH);
   * - its reference is a quote of this customer (QUOTE_NOT_FOUND), and equals `quoteId` when one is given (PAYMENT_MISMATCH);
   * - it is CAPTURED (PAYMENT_NOT_CAPTURED);
   * - its amount equals the held premium, to the fils (AMOUNT_MISMATCH);
   * - it was created before the quote expired (QUOTE_EXPIRED);
   * - the quote has no policy yet (ALREADY_BOUND). Confirming again with the same payment returns the same policy.
   */
  confirm(customerId: string, payment: Payment | undefined, quoteId?: string): Policy {
    if (!payment) throw new PolicyError('PAYMENT_NOT_FOUND', 'unknown payment');
    const existing = this.byPayment.get(payment.id);
    if (existing) {
      const bound = this.policies.get(existing)!;
      // Another customer's payment reads as unknown.
      if (bound.customerId !== customerId) throw new PolicyError('PAYMENT_NOT_FOUND', 'unknown payment');
      return this.view(bound);
    }
    if (payment.purpose !== 'insurance_premium') throw new PolicyError('PAYMENT_MISMATCH', `payment ${payment.id} is not an insurance premium`);
    if (quoteId !== undefined && quoteId !== payment.reference) {
      throw new PolicyError('PAYMENT_MISMATCH', `payment ${payment.id} is for ${payment.reference}, not ${quoteId}`);
    }
    const quote = this.quotes.get(payment.reference);
    if (!quote || quote.customerId !== customerId) throw new PolicyError('QUOTE_NOT_FOUND', `no policy quote ${payment.reference}`);
    if (payment.status !== 'CAPTURED') throw new PolicyError('PAYMENT_NOT_CAPTURED', `payment ${payment.id} is ${payment.status}, not CAPTURED`);
    if (payment.amountFils !== quote.premiumFils) {
      throw new PolicyError('AMOUNT_MISMATCH', `payment amount ${payment.amountFils} does not match the premium ${quote.premiumFils} fils`);
    }
    if (payment.createdAt > quote.expiresAt) throw new PolicyError('QUOTE_EXPIRED', `quote ${quote.id} expired before it was paid`);
    if (quote.policyId) throw new PolicyError('ALREADY_BOUND', `quote ${quote.id} is already bound to another payment`);

    const now = this.clock();
    const n = ++this.seq;
    const policy: Omit<Policy, 'status'> = {
      id: `pol_sbx_${now.getTime().toString(36)}_${n.toString(36)}`,
      policyNumber: `SBX-${LINE_CODE[quote.line]}-${bahrainToday(now).slice(2, 4)}-${String(++this.issued).padStart(6, '0')}`,
      customerId,
      line: quote.line,
      insurerId: quote.insurerId,
      insurerName: quote.insurerName,
      takaful: quote.takaful,
      premiumFils: quote.premiumFils,
      cover: quote.cover,
      startDate: quote.startDate,
      endDate: quote.endDate,
      quoteId: quote.id,
      paymentId: payment.id,
      issuedAt: now.toISOString(),
    };
    this.policies.set(policyKey(policy), policy);
    this.byPayment.set(payment.id, policyKey(policy));
    this.quotes.set(quote.id, { ...quote, policyId: policy.id });
    return this.view(policy);
  }

  /** Add a policy issued elsewhere (e.g. the demo history). */
  seed(policy: Omit<Policy, 'status'>): void {
    this.policies.set(policyKey(policy), policy);
  }

  /** Active policies first (soonest to end first), then expired ones (most recent first). */
  list(customerId: string): Policy[] {
    this.addHistory(customerId);
    const all = [...this.policies.values()].filter((p) => p.customerId === customerId).map((p) => this.view(p));
    return all.sort((a, b) =>
      a.status !== b.status ? (a.status === 'ACTIVE' ? -1 : 1) : a.status === 'ACTIVE' ? a.endDate.localeCompare(b.endDate) : b.endDate.localeCompare(a.endDate),
    );
  }

  private addHistory(customerId: string): void {
    if (!this.history || this.seeded.has(customerId)) return;
    this.seeded.add(customerId);
    for (const p of this.history(customerId)) this.seed(p);
  }

  private view(p: Omit<Policy, 'status'>): Policy {
    return { ...p, status: policyStatus(p.endDate, this.clock()) };
  }
}

/** Policies are stored per customer: seeded ids (the demo history) repeat across customers. */
function policyKey(p: Pick<Policy, 'customerId' | 'id'>): string {
  return `${p.customerId}\u0000${p.id}`;
}

/**
 * ⚠️ Demo history: a past GCC trip, so "My policies" shows an expired policy before anything is bought.
 * Priced with the same formula as live quotes.
 */
export function demoPolicyHistory(customerId: string): Omit<Policy, 'status'> {
  const plan = DEMO_TRAVEL_PLANS.find((p) => p.insurerId === 'pearl-takaful')!;
  const insurer = DEMO_INSURERS.find((i) => i.id === plan.insurerId)!;
  const trip = { region: 'gcc' as const, tier: 'basic' as const, adults: 2, children: 1 };
  const days = 8;
  return {
    id: 'pol_demo_history_1',
    policyNumber: 'SBX-TRV-25-000000',
    customerId,
    line: 'travel',
    insurerId: insurer.id,
    insurerName: insurer.name,
    takaful: insurer.takaful,
    premiumFils: travelPremium(plan, trip, days),
    cover: { line: 'travel', ...trip, days, medicalCoverFils: plan.medicalCoverFils.basic },
    startDate: '2025-12-20',
    endDate: '2025-12-27',
    quoteId: 'pq_demo_history_1',
    paymentId: 'pay_demo_history_1',
    issuedAt: '2025-12-18T10:00:00.000Z',
  };
}
