import type { Fils } from './money';
import { bhd } from './money';
import { maxMonthlyInstallment, preApprove, type CustomerFinancials } from './affordability';
import { quoteFinance, type FinanceQuote } from './pricing';
import { DBR_CAP_PCT, RATE_CARDS } from './rates';
import type { FinanceStructure, ProductLine } from './types';

/**
 * Origination: apply for vehicle, personal or home finance, get a decision, accept and e-sign the offer,
 * then fulfil it. ⚠️ Sandbox only: the decision rules below are placeholders until BCFC Credit Risk
 * provides the real policy and the Credit Reference Bureau (CRB) integration exists.
 */

export type OriginationProductLine = Extract<ProductLine, 'vehicle' | 'personal' | 'home'>;
export type OriginationStructure = Extract<FinanceStructure, 'conventional' | 'murabaha' | 'ijara'>;

export const ORIGINATION_PRODUCT_LINES: OriginationProductLine[] = ['vehicle', 'personal', 'home'];
/** Every structure origination knows. Which ones a product line offers comes from its rate card (RATE_CARDS). */
export const ORIGINATION_STRUCTURES: OriginationStructure[] = ['conventional', 'murabaha', 'ijara'];

/** ⚠️ VERIFY: smallest personal finance amount. Placeholder product rule. */
export const MIN_PERSONAL_FINANCE_FILS: Fils = bhd(500);

/**
 * ⚠️ VERIFY: placeholder referral threshold. A new installment that uses more than this share of the
 * customer's remaining DBR headroom is affordable but goes to a credit officer (thin margin).
 */
export const REFER_ABOVE_HEADROOM_PCT = 80;

export type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REFERRED'
  | 'DECLINED'
  | 'OFFER_ACCEPTED'
  | 'CONTRACT_SIGNED'
  | 'ASSET_PURCHASED_BY_BCFC'
  | 'OWNERSHIP_TRANSFERRED_TO_BCFC'
  | 'SALE_TO_CUSTOMER'
  // Home finance (conventional): TRESCO valuation of the property confirmed (needs a captured valuation fee)
  | 'VALUATION_CONFIRMED'
  // Home finance (Ijara Muntahia Bittamleek): BCFC leases the home it bought to the customer
  | 'LEASE_STARTED'
  // Ijara: ownership passes to the customer after the final rental
  | 'OWNERSHIP_TRANSFERRED_TO_CUSTOMER'
  | 'DISBURSED'
  | 'COMPLETED';

/** The Murabaha-only steps. Their order is a Shari'a requirement: BCFC must own the asset before selling it. */
export const MURABAHA_STEPS: ApplicationStatus[] = ['ASSET_PURCHASED_BY_BCFC', 'OWNERSHIP_TRANSFERRED_TO_BCFC', 'SALE_TO_CUSTOMER'];

/**
 * The Ijara Muntahia Bittamleek steps, in Shari'a order: BCFC buys the home (it must own it before leasing it),
 * leases it to the customer, and ownership passes to the customer only after the final rental.
 */
export const IJARA_STEPS: ApplicationStatus[] = ['ASSET_PURCHASED_BY_BCFC', 'LEASE_STARTED', 'OWNERSHIP_TRANSFERRED_TO_CUSTOMER'];

/**
 * Steps acceptance never performs in the sandbox: they happen later in the life of the contract and are shown as
 * steps still to come (ownership passes to the customer at the end of the lease).
 */
export const DEFERRED_STEPS: ApplicationStatus[] = ['OWNERSHIP_TRANSFERRED_TO_CUSTOMER'];

/**
 * Allowed transitions per structure. Shared until the contract is signed, then:
 * - conventional: BCFC disburses (to the dealer for a car, to the customer for personal finance).
 * - murabaha: CONTRACT_SIGNED is the master agreement and promise to purchase (wa'd). BCFC then buys the
 *   asset, takes ownership, and only then sells it to the customer at the disclosed sale price.
 *   For personal (commodity) Murabaha the customer's commodity is then sold for cash, which is DISBURSED.
 */
const COMMON: Partial<Record<ApplicationStatus, ApplicationStatus[]>> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['APPROVED', 'REFERRED', 'DECLINED'],
  // A credit officer decides referred applications.
  REFERRED: ['APPROVED', 'DECLINED'],
  APPROVED: ['OFFER_ACCEPTED'],
  OFFER_ACCEPTED: ['CONTRACT_SIGNED'],
  DISBURSED: ['COMPLETED'],
  DECLINED: [],
  COMPLETED: [],
};

const TRANSITIONS: Record<OriginationStructure, Partial<Record<ApplicationStatus, ApplicationStatus[]>>> = {
  conventional: { ...COMMON, CONTRACT_SIGNED: ['DISBURSED'] },
  murabaha: {
    ...COMMON,
    CONTRACT_SIGNED: ['ASSET_PURCHASED_BY_BCFC'],
    ASSET_PURCHASED_BY_BCFC: ['OWNERSHIP_TRANSFERRED_TO_BCFC'],
    OWNERSHIP_TRANSFERRED_TO_BCFC: ['SALE_TO_CUSTOMER'],
    SALE_TO_CUSTOMER: ['DISBURSED', 'COMPLETED'],
  },
  // Home only (the rate card offers Ijara for home): buy, lease, then ownership passes at the end of the lease.
  ijara: {
    ...COMMON,
    CONTRACT_SIGNED: ['ASSET_PURCHASED_BY_BCFC'],
    ASSET_PURCHASED_BY_BCFC: ['LEASE_STARTED'],
    LEASE_STARTED: ['OWNERSHIP_TRANSFERRED_TO_CUSTOMER'],
    OWNERSHIP_TRANSFERRED_TO_CUSTOMER: ['COMPLETED'],
  },
};

/** Conventional home finance: the property is valued (TRESCO) after signing and before BCFC pays out. */
const HOME_CONVENTIONAL: Partial<Record<ApplicationStatus, ApplicationStatus[]>> = {
  ...COMMON,
  CONTRACT_SIGNED: ['VALUATION_CONFIRMED'],
  VALUATION_CONFIRMED: ['DISBURSED'],
};

export class ApplicationTransitionError extends Error {
  constructor(
    public readonly from: ApplicationStatus,
    public readonly to: ApplicationStatus,
    structure: OriginationStructure,
  ) {
    super(`cannot move a ${structure} application from ${from} to ${to}`);
    this.name = 'ApplicationTransitionError';
  }
}

/**
 * Without `productLine`, the union over product lines. With it, Murabaha after SALE_TO_CUSTOMER is exact:
 * commodity (personal) Murabaha must pay out the cash (DISBURSED); vehicle Murabaha completes on the sale.
 * Conventional home finance goes through VALUATION_CONFIRMED before DISBURSED.
 */
export function allowedTransitions(
  structure: OriginationStructure,
  status: ApplicationStatus,
  productLine?: OriginationProductLine,
): ApplicationStatus[] {
  if (structure === 'conventional' && productLine === 'home') return HOME_CONVENTIONAL[status] ?? [];
  if (structure === 'conventional' && productLine === undefined) {
    return [...new Set([...(TRANSITIONS.conventional[status] ?? []), ...(HOME_CONVENTIONAL[status] ?? [])])];
  }
  const next = TRANSITIONS[structure][status] ?? [];
  if (structure === 'murabaha' && status === 'SALE_TO_CUSTOMER' && productLine) {
    return next.filter((s) => s === (productLine === 'personal' ? 'DISBURSED' : 'COMPLETED'));
  }
  return next;
}

export function assertTransition(
  structure: OriginationStructure,
  from: ApplicationStatus,
  to: ApplicationStatus,
  productLine?: OriginationProductLine,
): void {
  if (!allowedTransitions(structure, from, productLine).includes(to)) throw new ApplicationTransitionError(from, to, structure);
}

/** Steps after an approved offer is accepted, in order, for this product and structure. */
export function fulfilmentPath(productLine: OriginationProductLine, structure: OriginationStructure): ApplicationStatus[] {
  const signed: ApplicationStatus[] = ['OFFER_ACCEPTED', 'CONTRACT_SIGNED'];
  if (structure === 'conventional' && productLine === 'home') return [...signed, 'VALUATION_CONFIRMED', 'DISBURSED', 'COMPLETED'];
  if (structure === 'conventional') return [...signed, 'DISBURSED', 'COMPLETED'];
  if (structure === 'ijara') return [...signed, ...IJARA_STEPS, 'COMPLETED'];
  return [...signed, ...MURABAHA_STEPS, ...(productLine === 'personal' ? (['DISBURSED'] as const) : []), 'COMPLETED'];
}

export type DecisionOutcome = 'APPROVED' | 'REFERRED' | 'DECLINED';
export type DecisionReason = 'OK' | 'DBR_EXCEEDED' | 'AMOUNT_ABOVE_PREAPPROVAL' | 'HIGH_DBR_UTILISATION';

export interface Decision {
  outcome: DecisionOutcome;
  reasons: DecisionReason[];
  /** New monthly installment being asked for */
  monthlyFils: Fils;
  /** Headroom under the DBR cap before this application */
  maxMonthlyFils: Fils;
  dbrCapPct: number;
  /** Debt-burden ratio after this facility, percent (2 decimals); null without a salary */
  dbrAfterPct: number | null;
  /** Indicative pre-approved limit for this product line */
  preApprovedLimitFils: Fils;
}

export interface TimelineEvent {
  status: ApplicationStatus;
  /** ISO timestamp */
  at: string;
  /** Set when a person (not the automatic decision) made this step: a credit officer's review */
  by?: 'CREDIT_OFFICER';
}

/**
 * A credit officer's decision on a REFERRED application, as the customer sees it. Who reviewed it and the
 * officer's internal note stay in the back-office audit log (backoffice.ts), never on the customer's application.
 */
export interface CreditReview {
  outcome: 'APPROVED' | 'DECLINED';
  reviewedBy: 'CREDIT_OFFICER';
  /** ISO timestamp */
  reviewedAt: string;
}

export interface FinanceApplication {
  id: string;
  customerId: string;
  productLine: OriginationProductLine;
  structure: OriginationStructure;
  quote: FinanceQuote;
  /** What is being financed: the vehicle id for cars, the property id for home finance, a purpose label for personal finance */
  reference: string;
  /** Snapshot of the financials the decision used */
  applicant: CustomerFinancials;
  status: ApplicationStatus;
  decision?: Decision;
  /** Present once a credit officer decided a referred application */
  review?: CreditReview;
  timeline: TimelineEvent[];
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  /** Conventional home finance: the captured TRESCO valuation-fee payment that confirmed the valuation */
  valuationPaymentId?: string;
}

/**
 * Deterministic credit decision (⚠️ placeholder policy):
 * 1. DBR_EXCEEDED → DECLINED: the installment is above the customer's headroom under the DBR cap (hard rule).
 * 2. AMOUNT_ABOVE_PREAPPROVAL → REFERRED: financed amount is above the indicative pre-approved limit.
 * 3. HIGH_DBR_UTILISATION → REFERRED: affordable, but uses more than REFER_ABOVE_HEADROOM_PCT of the headroom.
 * Otherwise APPROVED with reason OK. All matching reasons are returned, most severe first.
 */
export function decide(application: Pick<FinanceApplication, 'productLine' | 'quote'>, f: CustomerFinancials): Decision {
  const monthlyFils = Math.max(application.quote.monthlyFils, application.quote.finalInstallmentFils);
  const maxMonthlyFils = maxMonthlyInstallment(f);
  const limit = preApprove(f).limits.find((l) => l.productLine === application.productLine);
  const preApprovedLimitFils = limit?.maxFinanceFils ?? 0;
  const dbrAfterPct =
    f.monthlySalaryFils > 0 ? Math.round(((f.existingObligationsFils + monthlyFils) * 10_000) / f.monthlySalaryFils) / 100 : null;

  const reasons: DecisionReason[] = [];
  if (monthlyFils > maxMonthlyFils) reasons.push('DBR_EXCEEDED');
  if (application.quote.financedFils > preApprovedLimitFils) reasons.push('AMOUNT_ABOVE_PREAPPROVAL');
  if (monthlyFils <= maxMonthlyFils && monthlyFils * 100 > maxMonthlyFils * REFER_ABOVE_HEADROOM_PCT) reasons.push('HIGH_DBR_UTILISATION');

  const outcome: DecisionOutcome = reasons.includes('DBR_EXCEEDED') ? 'DECLINED' : reasons.length ? 'REFERRED' : 'APPROVED';
  return {
    outcome,
    reasons: reasons.length ? reasons : ['OK'],
    monthlyFils,
    maxMonthlyFils,
    dbrCapPct: DBR_CAP_PCT,
    dbrAfterPct,
    preApprovedLimitFils,
  };
}

export interface ApplicationStep {
  status: ApplicationStatus;
  /** When the step happened; absent for steps still to come */
  at?: string;
  done: boolean;
  /** Part of the Murabaha sequence (BCFC buys, owns, then sells) */
  murabaha: boolean;
  /** Part of the Ijara Muntahia Bittamleek sequence (BCFC buys, leases, then ownership passes to the customer) */
  ijara: boolean;
  /** CREDIT_OFFICER when a credit officer made this step (reviewed a referred application) */
  by?: 'CREDIT_OFFICER';
}

/**
 * The full journey to show as a timeline: what happened (with timestamps) plus what is still to come.
 * Clients render this as-is, so the order of steps is never decided in the apps.
 */
export function applicationSteps(app: FinanceApplication): ApplicationStep[] {
  const done = app.timeline.map((e) => e.status);
  // Only an approved offer has steps still to come; referred and declined applications stop at the decision.
  // A referred application a credit officer approved continues exactly like an automatically approved one.
  const approved = app.decision?.outcome === 'APPROVED' || app.review?.outcome === 'APPROVED';
  const planned = app.status !== 'DECLINED' && approved ? fulfilmentPath(app.productLine, app.structure) : [];
  const flags = (status: ApplicationStatus) => ({
    murabaha: app.structure === 'murabaha' && MURABAHA_STEPS.includes(status),
    ijara: app.structure === 'ijara' && IJARA_STEPS.includes(status),
  });
  const out: ApplicationStep[] = app.timeline.map((e) => ({
    status: e.status,
    at: e.at,
    done: true,
    ...flags(e.status),
    ...(e.by ? { by: e.by } : {}),
  }));
  for (const status of planned) {
    if (!done.includes(status)) out.push({ status, done: false, ...flags(status) });
  }
  return out;
}

/**
 * What the customer must do before fulfilment can go on, if anything. Conventional home finance waits at
 * CONTRACT_SIGNED until a TRESCO valuation fee for the property is paid (GET /payments/price gives the amount).
 */
export interface ApplicationNextAction {
  type: 'PAY_VALUATION_FEE';
  purpose: 'valuation_fee';
  reference: string;
}

export function applicationNextAction(app: FinanceApplication): ApplicationNextAction | undefined {
  if (app.productLine === 'home' && app.structure === 'conventional' && app.status === 'CONTRACT_SIGNED') {
    return { type: 'PAY_VALUATION_FEE', purpose: 'valuation_fee', reference: app.reference };
  }
  return undefined;
}

/** API representation: the application plus its timeline steps (and the customer's next action, if any). */
export type ApplicationView = FinanceApplication & { steps: ApplicationStep[]; nextAction?: ApplicationNextAction };

export function applicationView(app: FinanceApplication): ApplicationView {
  const nextAction = applicationNextAction(app);
  return { ...app, steps: applicationSteps(app), ...(nextAction ? { nextAction } : {}) };
}

export class OriginationError extends Error {
  constructor(
    public readonly code: 'INVALID_REQUEST' | 'NOT_FOUND' | 'NOT_APPROVED' | 'VALUATION_REQUIRED',
    message: string,
  ) {
    super(message);
    this.name = 'OriginationError';
  }
}

/** Evidence a fulfilment step needs (sandbox: a captured payment id). */
export interface FulfilmentEvidence {
  /** A captured TRESCO valuation-fee payment for the property, by the applicant */
  valuationPaymentId?: string;
}

export interface ApplicationRequest {
  productLine: OriginationProductLine;
  structure: OriginationStructure;
  assetPriceFils: Fils;
  downPaymentFils: Fils;
  tenureMonths: number;
  reference: string;
  /** Client-generated; repeated requests with the same key return the same application */
  idempotencyKey: string;
}

export function validateApplicationRequest(req: ApplicationRequest): void {
  if (!ORIGINATION_PRODUCT_LINES.includes(req.productLine)) throw new OriginationError('INVALID_REQUEST', 'productLine must be vehicle, personal or home');
  // Only what the line's rate card offers: vehicle and personal (conventional, Murabaha), home (conventional, Ijara).
  const offered = RATE_CARDS[req.productLine].structures;
  if (!ORIGINATION_STRUCTURES.includes(req.structure) || !offered.includes(req.structure)) {
    throw new OriginationError('INVALID_REQUEST', `structure must be ${offered.join(' or ')} for ${req.productLine}`);
  }
  if (typeof req.idempotencyKey !== 'string' || req.idempotencyKey.length < 8) {
    throw new OriginationError('INVALID_REQUEST', 'idempotencyKey is required (min 8 chars)');
  }
  if (typeof req.reference !== 'string' || !req.reference) throw new OriginationError('INVALID_REQUEST', 'reference is required');
  if (req.productLine === 'personal' && req.assetPriceFils < MIN_PERSONAL_FINANCE_FILS) {
    throw new OriginationError('INVALID_REQUEST', `personal finance starts at ${MIN_PERSONAL_FINANCE_FILS} fils`);
  }
}

/**
 * In-memory sandbox origination service for the prototype (like SandboxPaymentGateway).
 * Production: the loan origination system, CRB and Open Banking checks, e-signature provider and,
 * for Murabaha, the dealer purchase and ownership transfer, each with its own evidence.
 */
export class SandboxOriginationService {
  private readonly byId = new Map<string, FinanceApplication>();
  private readonly byKey = new Map<string, string>();
  private seq = 0;

  constructor(private readonly clock: () => Date = () => new Date()) {}

  /**
   * Create a DRAFT application. Idempotent on `idempotencyKey` per customer: two customers using the same key
   * get separate applications. Throws QuoteError for invalid terms.
   */
  create(req: ApplicationRequest, applicant: CustomerFinancials, customerId: string): FinanceApplication {
    validateApplicationRequest(req);
    const existing = this.byKey.get(scopedKey(customerId, req.idempotencyKey));
    if (existing) return this.byId.get(existing)!;
    const quote = quoteFinance({
      productLine: req.productLine,
      structure: req.structure,
      assetPriceFils: req.assetPriceFils,
      downPaymentFils: req.downPaymentFils,
      tenureMonths: req.tenureMonths,
    });
    const now = this.clock().toISOString();
    const id = `app_sbx_${this.clock().getTime().toString(36)}_${(++this.seq).toString(36)}`;
    const app: FinanceApplication = {
      id,
      customerId,
      productLine: req.productLine,
      structure: req.structure,
      quote,
      reference: req.reference,
      applicant: { ...applicant },
      status: 'DRAFT',
      timeline: [{ status: 'DRAFT', at: now }],
      idempotencyKey: req.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(id, app);
    this.byKey.set(scopedKey(customerId, req.idempotencyKey), id);
    return app;
  }

  /**
   * Move to `to`, enforcing the state machine and recording a timeline event. VALUATION_CONFIRMED also needs
   * `evidence.valuationPaymentId` (a captured TRESCO valuation fee, found by the caller with findValuationPayment).
   */
  advance(id: string, to: ApplicationStatus, evidence: FulfilmentEvidence = {}): FinanceApplication {
    const app = this.require(id);
    assertTransition(app.structure, app.status, to, app.productLine);
    if (to === 'VALUATION_CONFIRMED' && !evidence.valuationPaymentId) {
      throw new OriginationError('VALUATION_REQUIRED', 'a captured valuation fee for the property is required');
    }
    const at = this.clock().toISOString();
    const updated: FinanceApplication = {
      ...app,
      status: to,
      timeline: [...app.timeline, { status: to, at }],
      updatedAt: at,
      ...(to === 'VALUATION_CONFIRMED' ? { valuationPaymentId: evidence.valuationPaymentId } : {}),
    };
    this.byId.set(id, updated);
    return updated;
  }

  /** Submit a DRAFT and decide it immediately against the applicant's financials. */
  submitAndDecide(id: string): FinanceApplication {
    const submitted = this.advance(id, 'SUBMITTED');
    const decision = decide(submitted, submitted.applicant);
    const decided = this.advance(id, decision.outcome);
    const withDecision = { ...decided, decision };
    this.byId.set(id, withDecision);
    return withDecision;
  }

  /** create + submit + decide. A repeated idempotency key returns the original application unchanged. */
  apply(req: ApplicationRequest, applicant: CustomerFinancials, customerId: string): FinanceApplication {
    const replay = this.byKey.get(scopedKey(customerId, req.idempotencyKey));
    if (replay) return this.byId.get(replay)!;
    return this.submitAndDecide(this.create(req, applicant, customerId).id);
  }

  /**
   * Accept the offer and e-sign (sandbox), then run fulfilment in order as far as it can go, recording every step:
   * to the end for vehicle and personal finance; for Ijara up to LEASE_STARTED (ownership passes after the final
   * rental); for conventional home finance VALUATION_CONFIRMED and after only with `evidence.valuationPaymentId`.
   * Accepting an already accepted application continues from where it stopped (a completed one is returned
   * unchanged). With `customerId`, another customer's application is NOT_FOUND (as if it did not exist).
   */
  accept(id: string, customerId?: string, evidence: FulfilmentEvidence = {}): FinanceApplication {
    let app = this.require(id);
    if (customerId !== undefined && app.customerId !== customerId) throw new OriginationError('NOT_FOUND', `unknown application ${id}`);
    if (app.status === 'COMPLETED') return app;
    const path = fulfilmentPath(app.productLine, app.structure);
    if (app.status !== 'APPROVED' && !path.includes(app.status)) {
      throw new OriginationError('NOT_APPROVED', `application is ${app.status}, only APPROVED offers can be accepted`);
    }
    for (const step of path.slice(path.indexOf(app.status) + 1)) {
      if (DEFERRED_STEPS.includes(step)) break;
      if (step === 'VALUATION_CONFIRMED' && !evidence.valuationPaymentId) break;
      app = this.advance(id, step, evidence);
    }
    return app;
  }

  /**
   * A credit officer decides a REFERRED application: REFERRED → APPROVED or DECLINED (the state machine refuses
   * anything else with ApplicationTransitionError). The timeline step and `review` record that a person decided it.
   * Called only by the back office (backoffice.ts), which checks the staff role and writes the audit entry.
   */
  review(id: string, outcome: CreditReview['outcome']): FinanceApplication {
    const advanced = this.advance(id, outcome);
    const timeline = advanced.timeline.map((e, i) => (i === advanced.timeline.length - 1 ? { ...e, by: 'CREDIT_OFFICER' as const } : e));
    const reviewed: FinanceApplication = {
      ...advanced,
      timeline,
      review: { outcome, reviewedBy: 'CREDIT_OFFICER', reviewedAt: advanced.updatedAt },
    };
    this.byId.set(id, reviewed);
    return reviewed;
  }

  /** Every customer's applications, newest first. Back office only: customer routes use list(customerId). */
  listAll(): FinanceApplication[] {
    return [...this.byId.values()].reverse();
  }

  /** With `customerId`, only that customer's application: another customer's id reads as undefined. */
  get(id: string, customerId?: string): FinanceApplication | undefined {
    const app = this.byId.get(id);
    return app && (customerId === undefined || app.customerId === customerId) ? app : undefined;
  }

  /** Newest first */
  list(customerId: string): FinanceApplication[] {
    return [...this.byId.values()].filter((a) => a.customerId === customerId).reverse();
  }

  private require(id: string): FinanceApplication {
    const app = this.byId.get(id);
    if (!app) throw new OriginationError('NOT_FOUND', `unknown application ${id}`);
    return app;
  }
}

/** Idempotency keys are only unique per customer. */
function scopedKey(customerId: string, idempotencyKey: string): string {
  return `${customerId}\u0000${idempotencyKey}`;
}
