import type { Fils } from './money';
import type { Contract, ContractSettlement, CustomerOverview } from './account';
import type { Payment } from './payments';
import { addDaysIso, bahrainToday } from './insurance-common';
import type { FinanceQuote } from './pricing';
import type { FinanceStructure } from './types';

/**
 * Early settlement and autopay for "My installments".
 *
 * Conventional: the customer pays the remaining principal from the amortization schedule plus a placeholder
 * early-settlement fee. Murabaha: the debt is the remaining sale price; BCFC may grant a rebate (Ibra') on the
 * profit not yet earned. Ibra' is discretionary under Shari'a (it cannot be a condition of the contract).
 * Ijara: the customer buys the asset for its remaining cost (the rental profit not yet due is not charged).
 *
 * ⚠️ PLACEHOLDER RULES. The fee and the Ibra' rule are illustrative, pending BCFC Risk, the Shari'a Supervisory
 * Board and current CBB rules. Figures are as of the last paid installment (no accrual to the settlement day).
 * Money is integer fils throughout.
 */

/** ⚠️ VERIFY with CBB rules: placeholder conventional early-settlement fee, percent of the remaining principal. */
export const EARLY_SETTLEMENT_FEE_PCT = 1;

/** ⚠️ VERIFY with the Shari'a board: placeholder share of the unearned (straight-line) profit given as Ibra'. */
export const IBRA_REBATE_PCT = 100;

/** How long a settlement quote can be paid against. */
export const SETTLEMENT_QUOTE_VALID_DAYS = 7;

export type SettlementLineKind =
  | 'remaining_principal'
  | 'settlement_fee'
  | 'remaining_sale_price'
  | 'ibra_rebate'
  | 'remaining_asset_cost';

export interface SettlementLine {
  kind: SettlementLineKind;
  /** Negative for deductions (the Ibra' rebate) */
  amountFils: Fils;
}

export interface SettlementQuote {
  contractId: string;
  structure: FinanceStructure;
  installmentsPaid: number;
  installmentsRemaining: number;
  /** What paying every remaining installment to term costs (sum of the unpaid installments) */
  remainingScheduledFils: Fils;
  lines: SettlementLine[];
  /** Pay this today to close the contract */
  settlementAmountFils: Fils;
  /** remainingScheduledFils - settlementAmountFils */
  savingsFils: Fils;
  basis: 'remaining-principal' | 'sale-price-less-ibra' | 'remaining-asset-cost';
  /** ⚠️ The rule is a placeholder pending the Shari'a board / CBB */
  pendingApproval: true;
  validUntil: string;
  /** What to send to POST /payments to settle */
  payment: { purpose: 'early_settlement'; amountFils: Fils; reference: string };
}

export type SettlementErrorCode =
  | 'CONTRACT_NOT_FOUND'
  | 'NOTHING_TO_SETTLE'
  | 'INVALID_REQUEST'
  | 'ALREADY_SETTLED'
  | 'PAYMENT_MISMATCH'
  | 'PAYMENT_NOT_CAPTURED'
  | 'AMOUNT_MISMATCH';

/** Suggested HTTP status for each settlement error. */
export const SETTLEMENT_ERROR_STATUS: Record<SettlementErrorCode, number> = {
  CONTRACT_NOT_FOUND: 404,
  NOTHING_TO_SETTLE: 409,
  INVALID_REQUEST: 422,
  ALREADY_SETTLED: 409,
  PAYMENT_MISMATCH: 422,
  PAYMENT_NOT_CAPTURED: 409,
  AMOUNT_MISMATCH: 422,
};

export class SettlementError extends Error {
  constructor(
    public readonly code: SettlementErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SettlementError';
  }
}

export interface AmortizationRow {
  number: number;
  paymentFils: Fils;
  /** Interest (conventional) or the profit part of the rental (Ijara) */
  costFils: Fils;
  principalFils: Fils;
  balanceFils: Fils;
}

/**
 * Integer-fils amortization schedule for a reducing-balance quote (conventional or Ijara).
 * Each period's cost is rounded to the fils; the last row clears the balance.
 */
export function amortizationSchedule(quote: FinanceQuote): AmortizationRow[] {
  if (quote.structure === 'murabaha') throw new SettlementError('INVALID_REQUEST', 'Murabaha has no amortization schedule');
  const r = quote.ratePct / 100 / 12;
  let balance = quote.financedFils;
  const rows: AmortizationRow[] = [];
  for (let n = 1; n <= quote.tenureMonths; n++) {
    const costFils = Math.round(balance * r);
    const last = n === quote.tenureMonths;
    const principalFils = last ? balance : Math.min(balance, quote.monthlyFils - costFils);
    balance -= principalFils;
    rows.push({ number: n, paymentFils: last ? principalFils + costFils : quote.monthlyFils, costFils, principalFils, balanceFils: balance });
  }
  return rows;
}

/** Principal (or asset cost) still owed after `paid` installments. */
export function remainingPrincipal(quote: FinanceQuote, paid: number): Fils {
  if (paid <= 0) return quote.financedFils;
  const rows = amortizationSchedule(quote);
  return rows[Math.min(paid, rows.length) - 1]!.balanceFils;
}

function remainingScheduled(quote: FinanceQuote, paid: number): Fils {
  let sum = 0;
  for (let n = paid + 1; n <= quote.tenureMonths; n++) sum += n === quote.tenureMonths ? quote.finalInstallmentFils : quote.monthlyFils;
  return sum;
}

/** Early-settlement quote for a contract, as of its last paid installment. */
export function settlementQuote(contract: Contract, today: Date = new Date()): SettlementQuote {
  const { quote, installmentsPaid: paid } = contract;
  if (contract.settlement) throw new SettlementError('ALREADY_SETTLED', `contract ${contract.id} is already settled`);
  if (!Number.isSafeInteger(quote.financedFils) || !Number.isSafeInteger(quote.monthlyFils) || !Number.isInteger(paid) || paid < 0) {
    throw new SettlementError('INVALID_REQUEST', 'contract amounts must be integer fils');
  }
  const installmentsRemaining = quote.tenureMonths - paid;
  if (installmentsRemaining <= 0) throw new SettlementError('NOTHING_TO_SETTLE', 'contract is fully paid');
  const remainingScheduledFils = remainingScheduled(quote, paid);

  let lines: SettlementLine[];
  let basis: SettlementQuote['basis'];
  if (contract.structure === 'murabaha') {
    // Debt = remaining sale price. Ibra' (placeholder): a share of the profit not yet earned, straight-line.
    const profit = quote.costOfFinanceFils;
    const unearned = Math.floor((profit * installmentsRemaining) / quote.tenureMonths);
    // The rebate never exceeds what is left to pay, so the settlement stays positive.
    const rebate = Math.min(Math.floor((unearned * IBRA_REBATE_PCT) / 100), remainingScheduledFils - 1);
    lines = [
      { kind: 'remaining_sale_price', amountFils: remainingScheduledFils },
      { kind: 'ibra_rebate', amountFils: -Math.max(0, rebate) },
    ];
    basis = 'sale-price-less-ibra';
  } else if (contract.structure === 'ijara') {
    lines = [{ kind: 'remaining_asset_cost', amountFils: remainingPrincipal(quote, paid) }];
    basis = 'remaining-asset-cost';
  } else {
    const principal = remainingPrincipal(quote, paid);
    const interestSaved = remainingScheduledFils - principal;
    // Placeholder fee, capped at half the interest saved so settling early always saves money.
    const fee = Math.max(0, Math.min(Math.round((principal * EARLY_SETTLEMENT_FEE_PCT) / 100), Math.floor(interestSaved / 2)));
    lines = [
      { kind: 'remaining_principal', amountFils: principal },
      { kind: 'settlement_fee', amountFils: fee },
    ];
    basis = 'remaining-principal';
  }
  const settlementAmountFils = lines.reduce((s, l) => s + l.amountFils, 0);
  // Counted from today's Bahrain date (UTC+3), like every other customer-facing date.
  const validUntil = addDaysIso(bahrainToday(today), SETTLEMENT_QUOTE_VALID_DAYS);
  return {
    contractId: contract.id,
    structure: contract.structure,
    installmentsPaid: paid,
    installmentsRemaining,
    remainingScheduledFils,
    lines,
    settlementAmountFils,
    savingsFils: remainingScheduledFils - settlementAmountFils,
    basis,
    pendingApproval: true,
    validUntil,
    payment: { purpose: 'early_settlement', amountFils: settlementAmountFils, reference: settlementReference(contract.id) },
  };
}

/** The payment reference that settles a contract (`{contractId}-settle`). */
export function settlementReference(contractId: string): string {
  return `${contractId}-settle`;
}

export function findContract(customer: CustomerOverview, id: string): Contract {
  const c = customer.contracts.find((x) => x.id === id);
  if (!c) throw new SettlementError('CONTRACT_NOT_FOUND', `contract ${id} not found`);
  return c;
}

/**
 * ⚠️ Sandbox contract settings (autopay) and early settlements, in memory, standing in for the core lending system
 * and the Tap recurring agreement. Production: turning autopay on needs a saved card / BenefitPay / direct-debit
 * mandate, and core lending closes the contract after the verified Tap webhook.
 */
export class SandboxContractSettings {
  private readonly autopay = new Map<string, boolean>();
  private readonly settled = new Map<string, ContractSettlement>();

  setAutopay(customer: CustomerOverview, contractId: string, autopay: unknown): Contract {
    if (typeof autopay !== 'boolean') throw new SettlementError('INVALID_REQUEST', 'autopay must be a boolean');
    const c = findContract(this.apply(customer), contractId);
    if (c.settlement) throw new SettlementError('ALREADY_SETTLED', `contract ${contractId} is already settled`);
    this.autopay.set(`${customer.customerId}:${contractId}`, autopay);
    return findContract(this.apply(customer), contractId);
  }

  /**
   * Checks an `early_settlement` payment of this customer before it is captured, so a wrong payment captures nothing:
   * its reference names one of the customer's contracts (`{id}-settle`, CONTRACT_NOT_FOUND), the contract is not
   * settled by another payment (ALREADY_SETTLED), and the amount equals the current settlement quote to the fils
   * (AMOUNT_MISMATCH). Returns the contract (already settled by this same payment when confirming again).
   * The caller must only pass payments it read for this customer (the gateway is scoped by owner).
   */
  verifySettlementPayment(customer: CustomerOverview, payment: Payment, today: Date = new Date()): Contract {
    if (payment.purpose !== 'early_settlement') throw new SettlementError('PAYMENT_MISMATCH', `payment ${payment.id} is not an early settlement`);
    const contract = this.apply(customer).contracts.find((c) => settlementReference(c.id) === payment.reference);
    if (!contract) throw new SettlementError('CONTRACT_NOT_FOUND', `no contract to settle for reference ${payment.reference}`);
    if (contract.settlement) {
      if (contract.settlement.paymentId === payment.id) return contract;
      throw new SettlementError('ALREADY_SETTLED', `contract ${contract.id} is already settled`);
    }
    const quote = settlementQuote(contract, today);
    if (payment.amountFils !== quote.settlementAmountFils) {
      throw new SettlementError(
        'AMOUNT_MISMATCH',
        `payment amount ${payment.amountFils} does not match the settlement amount ${quote.settlementAmountFils} fils for ${contract.id}`,
      );
    }
    return contract;
  }

  /**
   * Marks the contract settled for this customer once its settlement payment is CAPTURED (rules as in
   * verifySettlementPayment). Repeating it with the same payment returns the same settled contract.
   */
  settle(customer: CustomerOverview, payment: Payment, now: Date = new Date()): Contract {
    const contract = this.verifySettlementPayment(customer, payment, now);
    if (contract.settlement) return contract;
    if (payment.status !== 'CAPTURED') throw new SettlementError('PAYMENT_NOT_CAPTURED', `payment ${payment.id} is ${payment.status}, not CAPTURED`);
    this.settled.set(`${customer.customerId}:${contract.id}`, {
      paymentId: payment.id,
      amountFils: payment.amountFils,
      settledAt: now.toISOString(),
      settledOn: bahrainToday(now),
    });
    return findContract(this.apply(customer), contract.id);
  }

  /**
   * The customer overview with this customer's settings applied (keyed by customerId, so per session customer).
   * A settled contract has nothing outstanding, no next installment and no autopay.
   */
  apply<C extends CustomerOverview>(customer: C): C {
    return {
      ...customer,
      contracts: customer.contracts.map((c) => {
        const key = `${customer.customerId}:${c.id}`;
        const settlement = this.settled.get(key);
        if (settlement) {
          const closed: Contract = { ...c, outstandingFils: 0, autopay: false, settlement: { ...settlement } };
          delete closed.nextInstallment;
          return closed;
        }
        const a = this.autopay.get(key);
        return a === undefined ? c : { ...c, autopay: a };
      }),
    };
  }
}
