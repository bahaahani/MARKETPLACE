import type { Fils } from './money';
import { bhd } from './money';
import { maxMonthlyInstallment, preApprove, type CustomerFinancials } from './affordability';
import { quoteFinance, type FinanceQuote } from './pricing';
import { DBR_CAP_PCT } from './rates';
import type { FinanceStructure, ProductLine } from './types';

/**
 * Origination: apply for vehicle or personal finance, get a decision, accept and e-sign the offer,
 * then fulfil it. ⚠️ Sandbox only: the decision rules below are placeholders until BCFC Credit Risk
 * provides the real policy and the Credit Reference Bureau (CRB) integration exists.
 */

export type OriginationProductLine = Extract<ProductLine, 'vehicle' | 'personal'>;
export type OriginationStructure = Extract<FinanceStructure, 'conventional' | 'murabaha'>;

export const ORIGINATION_PRODUCT_LINES: OriginationProductLine[] = ['vehicle', 'personal'];
export const ORIGINATION_STRUCTURES: OriginationStructure[] = ['conventional', 'murabaha'];

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
  | 'DISBURSED'
  | 'COMPLETED';

/** The Murabaha-only steps. Their order is a Shari'a requirement: BCFC must own the asset before selling it. */
export const MURABAHA_STEPS: ApplicationStatus[] = ['ASSET_PURCHASED_BY_BCFC', 'OWNERSHIP_TRANSFERRED_TO_BCFC', 'SALE_TO_CUSTOMER'];

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

export function allowedTransitions(structure: OriginationStructure, status: ApplicationStatus): ApplicationStatus[] {
  return TRANSITIONS[structure][status] ?? [];
}

export function assertTransition(structure: OriginationStructure, from: ApplicationStatus, to: ApplicationStatus): void {
  if (!allowedTransitions(structure, from).includes(to)) throw new ApplicationTransitionError(from, to, structure);
}

/** Steps after an approved offer is accepted, in order, for this product and structure. */
export function fulfilmentPath(productLine: OriginationProductLine, structure: OriginationStructure): ApplicationStatus[] {
  const signed: ApplicationStatus[] = ['OFFER_ACCEPTED', 'CONTRACT_SIGNED'];
  if (structure === 'conventional') return [...signed, 'DISBURSED', 'COMPLETED'];
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
}

export interface FinanceApplication {
  id: string;
  customerId: string;
  productLine: OriginationProductLine;
  structure: OriginationStructure;
  quote: FinanceQuote;
  /** What is being financed: the vehicle id for cars, a purpose label for personal finance */
  reference: string;
  /** Snapshot of the financials the decision used */
  applicant: CustomerFinancials;
  status: ApplicationStatus;
  decision?: Decision;
  timeline: TimelineEvent[];
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
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
}

/**
 * The full journey to show as a timeline: what happened (with timestamps) plus what is still to come.
 * Clients render this as-is, so the order of steps is never decided in the apps.
 */
export function applicationSteps(app: FinanceApplication): ApplicationStep[] {
  const done = app.timeline.map((e) => e.status);
  // Only an approved offer has steps still to come; referred and declined applications stop at the decision.
  const planned = app.status !== 'DECLINED' && app.decision?.outcome === 'APPROVED' ? fulfilmentPath(app.productLine, app.structure) : [];
  const out: ApplicationStep[] = app.timeline.map((e) => ({ status: e.status, at: e.at, done: true, murabaha: MURABAHA_STEPS.includes(e.status) }));
  for (const status of planned) {
    if (!done.includes(status)) out.push({ status, done: false, murabaha: MURABAHA_STEPS.includes(status) });
  }
  return out;
}

/** API representation: the application plus its timeline steps. */
export type ApplicationView = FinanceApplication & { steps: ApplicationStep[] };

export function applicationView(app: FinanceApplication): ApplicationView {
  return { ...app, steps: applicationSteps(app) };
}

export class OriginationError extends Error {
  constructor(
    public readonly code: 'INVALID_REQUEST' | 'NOT_FOUND' | 'NOT_APPROVED',
    message: string,
  ) {
    super(message);
    this.name = 'OriginationError';
  }
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
  if (!ORIGINATION_PRODUCT_LINES.includes(req.productLine)) throw new OriginationError('INVALID_REQUEST', 'productLine must be vehicle or personal');
  if (!ORIGINATION_STRUCTURES.includes(req.structure)) throw new OriginationError('INVALID_REQUEST', 'structure must be conventional or murabaha');
  if (!req.idempotencyKey || req.idempotencyKey.length < 8) {
    throw new OriginationError('INVALID_REQUEST', 'idempotencyKey is required (min 8 chars)');
  }
  if (!req.reference) throw new OriginationError('INVALID_REQUEST', 'reference is required');
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

  /** Create a DRAFT application. Idempotent on `idempotencyKey`. Throws QuoteError for invalid terms. */
  create(req: ApplicationRequest, applicant: CustomerFinancials, customerId: string): FinanceApplication {
    validateApplicationRequest(req);
    const existing = this.byKey.get(req.idempotencyKey);
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
    this.byKey.set(req.idempotencyKey, id);
    return app;
  }

  /** Move to `to`, enforcing the state machine and recording a timeline event. */
  advance(id: string, to: ApplicationStatus): FinanceApplication {
    const app = this.require(id);
    assertTransition(app.structure, app.status, to);
    const at = this.clock().toISOString();
    const updated: FinanceApplication = { ...app, status: to, timeline: [...app.timeline, { status: to, at }], updatedAt: at };
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
    const replay = this.byKey.get(req.idempotencyKey);
    if (replay) return this.byId.get(replay)!;
    return this.submitAndDecide(this.create(req, applicant, customerId).id);
  }

  /**
   * Accept the offer and e-sign (sandbox), then run fulfilment to the end, recording every step.
   * Accepting a completed application again returns it unchanged.
   */
  accept(id: string): FinanceApplication {
    let app = this.require(id);
    if (app.status === 'COMPLETED') return app;
    if (app.status !== 'APPROVED') throw new OriginationError('NOT_APPROVED', `application is ${app.status}, only APPROVED offers can be accepted`);
    for (const step of fulfilmentPath(app.productLine, app.structure)) app = this.advance(id, step);
    return app;
  }

  get(id: string): FinanceApplication | undefined {
    return this.byId.get(id);
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
