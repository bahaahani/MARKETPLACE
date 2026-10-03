import type { Fils } from './money';
import type { Contract, CustomerOverview } from './account';
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

export class SettlementError extends Error {
  constructor(
    public readonly code: 'CONTRACT_NOT_FOUND' | 'NOTHING_TO_SETTLE' | 'INVALID_REQUEST',
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
  const validUntil = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + SETTLEMENT_QUOTE_VALID_DAYS))
    .toISOString()
    .slice(0, 10);
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
    payment: { purpose: 'early_settlement', amountFils: settlementAmountFils, reference: `${contract.id}-settle` },
  };
}

export function findContract(customer: CustomerOverview, id: string): Contract {
  const c = customer.contracts.find((x) => x.id === id);
  if (!c) throw new SettlementError('CONTRACT_NOT_FOUND', `contract ${id} not found`);
  return c;
}

/**
 * ⚠️ Sandbox contract settings (autopay), in memory, standing in for the core lending system and the
 * Tap recurring agreement. Production: turning autopay on needs a saved card / BenefitPay / direct-debit mandate.
 */
export class SandboxContractSettings {
  private readonly autopay = new Map<string, boolean>();

  setAutopay(customer: CustomerOverview, contractId: string, autopay: unknown): Contract {
    if (typeof autopay !== 'boolean') throw new SettlementError('INVALID_REQUEST', 'autopay must be a boolean');
    findContract(customer, contractId);
    this.autopay.set(`${customer.customerId}:${contractId}`, autopay);
    return findContract(this.apply(customer), contractId);
  }

  /** The customer overview with this session's settings applied. */
  apply(customer: CustomerOverview): CustomerOverview {
    return {
      ...customer,
      contracts: customer.contracts.map((c) => {
        const a = this.autopay.get(`${customer.customerId}:${c.id}`);
        return a === undefined ? c : { ...c, autopay: a };
      }),
    };
  }
}
