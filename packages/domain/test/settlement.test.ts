import { describe, expect, it } from 'vitest';
import {
  amortizationSchedule,
  bhd,
  demoCustomer,
  findContract,
  PaymentNotFoundError,
  quoteFinance,
  remainingPrincipal,
  SandboxContractSettings,
  SandboxPaymentGateway,
  SettlementError,
  settlementQuote,
  type Contract,
  type FinanceQuote,
  type Payment,
} from '../src';

const TODAY = new Date('2026-10-03T09:00:00Z');
const me = demoCustomer(TODAY);

function contract(quote: FinanceQuote, paid: number, id = 'c-test'): Contract {
  return { id, title: { en: 'Test', ar: 'اختبار' }, structure: quote.structure, quote, startDate: '2026-01-01', outstandingFils: 0, installmentsPaid: paid, autopay: false };
}

const personal = quoteFinance({ productLine: 'personal', structure: 'conventional', assetPriceFils: bhd(3_000), downPaymentFils: 0, tenureMonths: 36 });
const carMurabaha = quoteFinance({ productLine: 'vehicle', structure: 'murabaha', assetPriceFils: bhd(14_900), downPaymentFils: bhd(2_980), tenureMonths: 60 });
const homeIjara = quoteFinance({ productLine: 'home', structure: 'ijara', assetPriceFils: bhd(98_000), downPaymentFils: bhd(19_600), tenureMonths: 240 });

describe('amortization schedule', () => {
  it('repays exactly the financed amount in integer fils', () => {
    const rows = amortizationSchedule(personal);
    expect(rows).toHaveLength(36);
    expect(rows.reduce((s, r) => s + r.principalFils, 0)).toBe(personal.financedFils);
    expect(rows.at(-1)!.balanceFils).toBe(0);
    for (const r of rows) for (const v of Object.values(r)) expect(Number.isSafeInteger(v)).toBe(true);
    expect(remainingPrincipal(personal, 0)).toBe(personal.financedFils);
  });

  it('has no schedule for Murabaha (a sale, not a loan)', () => {
    expect(() => amortizationSchedule(carMurabaha)).toThrow(SettlementError);
  });
});

describe('settlement quote', () => {
  it('conventional: remaining principal plus a capped placeholder fee, below the remaining scheduled total', () => {
    const q = settlementQuote(me.contracts.find((c) => c.structure === 'conventional')!, TODAY);
    expect(q.basis).toBe('remaining-principal');
    expect(q.lines.map((l) => l.kind)).toEqual(['remaining_principal', 'settlement_fee']);
    expect(q.lines[0]!.amountFils).toBe(remainingPrincipal(personal, 7));
    expect(q.settlementAmountFils).toBeLessThan(q.remainingScheduledFils);
    expect(q.savingsFils).toBe(q.remainingScheduledFils - q.settlementAmountFils);
    expect(q.payment).toEqual({ purpose: 'early_settlement', amountFils: q.settlementAmountFils, reference: 'c-1002-settle' });
    // Pinned (illustrative rate cards) so API, web and mobile fixtures agree.
    expect(q.settlementAmountFils).toBe(2_492_808);
    expect(q.remainingScheduledFils).toBe(2_706_251);
  });

  it('Murabaha: remaining sale price minus an Ibra\' rebate, never "interest"', () => {
    const c = findContract(me, 'c-1001');
    const q = settlementQuote(c, TODAY);
    expect(q.basis).toBe('sale-price-less-ibra');
    expect(q.lines.map((l) => l.kind)).toEqual(['remaining_sale_price', 'ibra_rebate']);
    expect(q.lines[0]!.amountFils).toBe(c.outstandingFils);
    expect(q.lines[1]!.amountFils).toBeLessThan(0);
    expect(q.settlementAmountFils).toBeLessThan(q.remainingScheduledFils);
    expect(JSON.stringify(q).toLowerCase()).not.toMatch(/interest|principal/);
    expect(q.pendingApproval).toBe(true);
  });

  it('Ijara: remaining asset cost, never "interest"', () => {
    const q = settlementQuote(contract(homeIjara, 24));
    expect(q.basis).toBe('remaining-asset-cost');
    expect(q.settlementAmountFils).toBeLessThan(q.remainingScheduledFils);
    expect(JSON.stringify(q).toLowerCase()).not.toContain('interest');
  });

  it('settles for less than paying to term at every point of every structure, in integer fils', () => {
    for (const quote of [personal, carMurabaha, homeIjara]) {
      for (let paid = 0; paid < quote.tenureMonths; paid += quote.tenureMonths > 60 ? 17 : 1) {
        const q = settlementQuote(contract(quote, paid), TODAY);
        expect(q.installmentsRemaining).toBe(quote.tenureMonths - paid);
        expect(q.settlementAmountFils).toBeGreaterThan(0);
        expect(q.settlementAmountFils).toBeLessThan(q.remainingScheduledFils);
        expect(q.savingsFils).toBeGreaterThan(0);
        for (const v of [q.settlementAmountFils, q.remainingScheduledFils, q.savingsFils, ...q.lines.map((l) => l.amountFils)]) {
          expect(Number.isSafeInteger(v)).toBe(true);
        }
      }
    }
  });

  it('the remaining scheduled total matches the contract outstanding balance', () => {
    for (const c of me.contracts) expect(settlementQuote(c, TODAY).remainingScheduledFils).toBe(c.outstandingFils);
  });

  it('rejects a fully paid contract and non-integer amounts', () => {
    expect(() => settlementQuote(contract(personal, 36))).toThrow(/fully paid/);
    expect(() => settlementQuote(contract({ ...personal, financedFils: 1.5 }, 1))).toThrow(SettlementError);
    expect(() => findContract(me, 'nope')).toThrow(SettlementError);
  });

  it('is valid for 7 days', () => {
    expect(settlementQuote(me.contracts[0]!, TODAY).validUntil).toBe('2026-10-10');
    // Counted from the Bahrain date: at 22:00 UTC it is already 4 October in Bahrain (UTC+3).
    expect(settlementQuote(me.contracts[0]!, new Date('2026-10-03T22:00:00Z')).validUntil).toBe('2026-10-11');
  });
});

describe('autopay (sandbox)', () => {
  it('toggles autopay per contract and applies it to the overview', () => {
    const store = new SandboxContractSettings();
    expect(findContract(me, 'c-1002').autopay).toBe(false);
    expect(store.setAutopay(me, 'c-1002', true).autopay).toBe(true);
    expect(findContract(store.apply(me), 'c-1002').autopay).toBe(true);
    expect(findContract(store.apply(me), 'c-1001').autopay).toBe(true);
    store.setAutopay(me, 'c-1001', false);
    expect(findContract(store.apply(me), 'c-1001').autopay).toBe(false);
    // The source overview is not mutated.
    expect(findContract(me, 'c-1001').autopay).toBe(true);
  });

  it('validates the contract and the flag', () => {
    const store = new SandboxContractSettings();
    expect(() => store.setAutopay(me, 'c-9999', true)).toThrow(/not found/);
    expect(() => store.setAutopay(me, 'c-1001', 'yes')).toThrow(/boolean/);
  });
});

describe('early settlement payment closes the contract (sandbox)', () => {
  const gateway = () => new SandboxPaymentGateway();
  const code = (f: () => unknown) => {
    try {
      f();
    } catch (e) {
      return (e as SettlementError).code;
    }
    return undefined;
  };
  async function settlementPayment(gw: SandboxPaymentGateway, amountFils: number, reference = 'c-1001-settle', capture = true): Promise<Payment> {
    const p = await gw.createCharge({ amountFils, method: 'card', purpose: 'early_settlement', reference, idempotencyKey: `key-${amountFils}-${reference}` }, me.customerId);
    return capture ? gw.confirm(p.id, me.customerId) : p;
  }

  it('a captured payment of the quoted amount settles the contract: nothing outstanding, no next installment, no autopay', async () => {
    const settings = new SandboxContractSettings();
    const quote = settlementQuote(findContract(me, 'c-1001'), TODAY);
    const paid = await settlementPayment(gateway(), quote.settlementAmountFils);
    const settled = settings.settle(me, paid, TODAY);
    expect(settled.settlement).toEqual({ paymentId: paid.id, amountFils: quote.settlementAmountFils, settledAt: TODAY.toISOString(), settledOn: '2026-10-03' });
    expect(settled.outstandingFils).toBe(0);
    expect(settled.nextInstallment).toBeUndefined();
    expect(settled.autopay).toBe(false);
    const view = settings.apply(me);
    expect(findContract(view, 'c-1001').settlement?.paymentId).toBe(paid.id);
    // The other contract and other customers are untouched.
    expect(findContract(view, 'c-1002').settlement).toBeUndefined();
    expect(findContract(settings.apply({ ...me, customerId: 'someone-else' }), 'c-1001').settlement).toBeUndefined();
    // Confirming again with the same payment is idempotent; a settled contract has no quote and no autopay.
    expect(settings.settle(view, paid, TODAY)).toEqual(settled);
    expect(code(() => settlementQuote(findContract(view, 'c-1001'), TODAY))).toBe('ALREADY_SETTLED');
    expect(code(() => settings.setAutopay(me, 'c-1001', true))).toBe('ALREADY_SETTLED');
  });

  it('a mismatched amount, a payment that is not captured or not a settlement, or an unknown contract changes nothing', async () => {
    const settings = new SandboxContractSettings();
    const gw = gateway();
    const amount = settlementQuote(findContract(me, 'c-1002'), TODAY).settlementAmountFils;
    const wrong = await settlementPayment(gw, amount - 1, 'c-1002-settle', false);
    expect(code(() => settings.verifySettlementPayment(me, wrong, TODAY))).toBe('AMOUNT_MISMATCH');
    expect(code(() => settings.settle(me, wrong, TODAY))).toBe('AMOUNT_MISMATCH');
    const notCaptured = await settlementPayment(gw, amount, 'c-1002-settle', false);
    expect(settings.verifySettlementPayment(me, notCaptured, TODAY).id).toBe('c-1002');
    expect(code(() => settings.settle(me, notCaptured, TODAY))).toBe('PAYMENT_NOT_CAPTURED');
    expect(code(() => settings.settle(me, { ...notCaptured, status: 'CAPTURED', purpose: 'installment' }, TODAY))).toBe('PAYMENT_MISMATCH');
    expect(code(() => settings.settle(me, { ...notCaptured, status: 'CAPTURED', reference: 'c-404-settle' }, TODAY))).toBe('CONTRACT_NOT_FOUND');
    expect(code(() => settings.settle(me, { ...notCaptured, status: 'CAPTURED', reference: 'c-1002' }, TODAY))).toBe('CONTRACT_NOT_FOUND');
    expect(settings.apply(me).contracts.every((c) => !c.settlement)).toBe(true);
    // Settled by one payment, a second settlement payment is rejected.
    settings.settle(me, await gw.confirm(notCaptured.id, me.customerId), TODAY);
    expect(code(() => settings.settle(me, { ...notCaptured, id: 'pay_other', status: 'CAPTURED' }, TODAY))).toBe('ALREADY_SETTLED');
  });

  it("another customer's or an unknown payment is not found", async () => {
    const gw = gateway();
    const p = await settlementPayment(gw, 1_000, 'c-1001-settle', false);
    await expect(gw.confirm(p.id, 'cus_other')).rejects.toThrow(PaymentNotFoundError);
    await expect(gw.confirm('pay_nope', me.customerId)).rejects.toThrow(PaymentNotFoundError);
  });
});
