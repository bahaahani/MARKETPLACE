import type { Fils } from './money';

/**
 * Payment abstraction. The production implementation wraps Tap Payments server-side
 * (secret key never reaches clients); the app only confirms with Tap SDKs and the backend
 * verifies via signed webhook + charge retrieve before anything is marked paid.
 */
export type PaymentMethod = 'card' | 'click_to_pay' | 'apple_pay' | 'google_pay' | 'samsung_pay' | 'benefitpay';

export const PAYMENT_METHODS: PaymentMethod[] = ['benefitpay', 'apple_pay', 'google_pay', 'samsung_pay', 'click_to_pay', 'card'];

export type PaymentPurpose = 'reservation_deposit' | 'installment' | 'insurance_premium' | 'early_settlement' | 'valuation_fee';

export const PAYMENT_PURPOSES: PaymentPurpose[] = ['reservation_deposit', 'installment', 'insurance_premium', 'early_settlement', 'valuation_fee'];

export type PaymentStatus = 'INITIATED' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'VOIDED' | 'REFUNDED';

export type PaymentEvent = 'authorize' | 'capture' | 'fail' | 'void' | 'refund';

const TRANSITIONS: Record<PaymentStatus, Partial<Record<PaymentEvent, PaymentStatus>>> = {
  INITIATED: { authorize: 'AUTHORIZED', capture: 'CAPTURED', fail: 'FAILED' },
  AUTHORIZED: { capture: 'CAPTURED', void: 'VOIDED', fail: 'FAILED' },
  CAPTURED: { refund: 'REFUNDED' },
  FAILED: {},
  VOIDED: {},
  REFUNDED: {},
};

export class PaymentTransitionError extends Error {
  constructor(from: PaymentStatus, event: PaymentEvent) {
    super(`cannot ${event} a payment in status ${from}`);
    this.name = 'PaymentTransitionError';
  }
}

export function transition(status: PaymentStatus, event: PaymentEvent): PaymentStatus {
  const next = TRANSITIONS[status][event];
  if (!next) throw new PaymentTransitionError(status, event);
  return next;
}

export interface PaymentRequest {
  amountFils: Fils;
  method: PaymentMethod;
  purpose: PaymentPurpose;
  /** Contract, listing or policy the payment is for */
  reference: string;
  /** Client-generated; repeated requests with the same key return the same payment */
  idempotencyKey: string;
}

export interface Payment extends PaymentRequest {
  id: string;
  status: PaymentStatus;
  currency: 'BHD';
  createdAt: string;
  /** Where the client continues (3-D Secure page, BenefitPay QR, or wallet sheet) */
  nextAction: 'none' | 'redirect' | 'wallet_sheet' | 'benefitpay_qr';
}

export interface PaymentGateway {
  createCharge(req: PaymentRequest): Promise<Payment>;
  confirm(paymentId: string): Promise<Payment>;
}

export class PaymentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentValidationError';
  }
}

/** Unknown payment id, or another customer's payment (which reads as unknown). */
export class PaymentNotFoundError extends Error {
  constructor(paymentId: string) {
    super(`unknown payment ${paymentId}`);
    this.name = 'PaymentNotFoundError';
  }
}

export function validatePaymentRequest(req: PaymentRequest): void {
  if (!Number.isSafeInteger(req.amountFils) || req.amountFils <= 0) {
    throw new PaymentValidationError('amountFils must be a positive integer');
  }
  if (!PAYMENT_METHODS.includes(req.method)) throw new PaymentValidationError(`unsupported method ${req.method}`);
  if (!PAYMENT_PURPOSES.includes(req.purpose)) throw new PaymentValidationError(`unsupported purpose ${req.purpose}`);
  if (typeof req.idempotencyKey !== 'string' || req.idempotencyKey.length < 8) {
    throw new PaymentValidationError('idempotencyKey is required (min 8 chars)');
  }
  if (typeof req.reference !== 'string' || !req.reference) throw new PaymentValidationError('reference is required');
}

function nextActionFor(method: PaymentMethod): Payment['nextAction'] {
  switch (method) {
    case 'apple_pay':
    case 'google_pay':
    case 'samsung_pay':
      return 'wallet_sheet';
    case 'benefitpay':
      return 'benefitpay_qr';
    default:
      return 'redirect';
  }
}

/**
 * In-memory sandbox gateway for the prototype. Behaves like Tap's flow
 * (create → customer action → confirm) without moving money.
 */
export class SandboxPaymentGateway implements PaymentGateway {
  private readonly byId = new Map<string, Payment>();
  private readonly byKey = new Map<string, string>();
  private readonly owners = new Map<string, string>();
  private seq = 0;

  /** This owner's payments, oldest first (e.g. to find a captured valuation fee for a home finance application). */
  list(ownerId: string): Payment[] {
    return [...this.byId.values()].filter((p) => this.owners.get(p.id) === ownerId);
  }

  /**
   * With `ownerId` (the sandbox customer session), idempotency keys are scoped to that owner and only the
   * owner can confirm the payment.
   */
  async createCharge(req: PaymentRequest, ownerId?: string): Promise<Payment> {
    validatePaymentRequest(req);
    const key = ownerId === undefined ? req.idempotencyKey : `${ownerId}\u0000${req.idempotencyKey}`;
    const existing = this.byKey.get(key);
    if (existing) return this.byId.get(existing)!;
    const id = `pay_sbx_${Date.now().toString(36)}_${(++this.seq).toString(36)}`;
    const payment: Payment = {
      ...req,
      id,
      status: 'INITIATED',
      currency: 'BHD',
      createdAt: new Date().toISOString(),
      nextAction: nextActionFor(req.method),
    };
    this.byId.set(id, payment);
    this.byKey.set(key, id);
    if (ownerId !== undefined) this.owners.set(id, ownerId);
    return payment;
  }

  async confirm(paymentId: string, ownerId?: string): Promise<Payment> {
    const p = this.byId.get(paymentId);
    const owner = this.owners.get(paymentId);
    // Another customer's payment reads as unknown.
    if (!p || (ownerId !== undefined && owner !== undefined && owner !== ownerId)) throw new PaymentNotFoundError(paymentId);
    if (p.status === 'CAPTURED') return p;
    const updated = { ...p, status: transition(p.status, 'capture'), nextAction: 'none' as const };
    this.byId.set(paymentId, updated);
    return updated;
  }

  /** With `ownerId`, another owner's payment reads as undefined (like confirm). */
  get(paymentId: string, ownerId?: string): Payment | undefined {
    const owner = this.owners.get(paymentId);
    if (ownerId !== undefined && owner !== undefined && owner !== ownerId) return undefined;
    return this.byId.get(paymentId);
  }
}
