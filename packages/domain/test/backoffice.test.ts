import { describe, expect, it } from 'vitest';
import {
  applicationSteps,
  ApplicationTransitionError,
  applicationView,
  fulfilmentPath,
  homeApplicationRequest,
  assertPermission,
  AuditLog,
  auditEntries,
  backOfficeKpis,
  BackOfficeError,
  bhd,
  can,
  creditQueue,
  decideReferred,
  newCustomerProfile,
  refundOrphanPremium,
  refundQueue,
  ROLE_PERMISSIONS,
  SANDBOX_STAFF,
  SandboxOriginationService,
  SandboxPaymentGateway,
  SandboxPolicyStore,
  SandboxStaffAuth,
  STAFF_ROLES,
  withIdentity,
  type ApplicationRequest,
  type CustomerFinancials,
  type CustomerProfile,
  type PolicyBoundCheck,
  type PolicyQuoteRequest,
} from '../src';
// The web API's error mapping for back-office routes: role failures must be 401 / 403.
import { handleBackOfficeError } from '../../../apps/web/lib/backoffice-errors';

const officer = SANDBOX_STAFF.credit_officer;
const ops = SANDBOX_STAFF.operations;
const compliance = SANDBOX_STAFF.compliance;

const applicant: CustomerFinancials = { monthlySalaryFils: bhd(1_400), existingObligationsFils: 326_753 };
// Thin margin (HIGH_DBR_UTILISATION): referred.
const patrol: ApplicationRequest = {
  productLine: 'vehicle',
  structure: 'conventional',
  assetPriceFils: bhd(20_000),
  downPaymentFils: bhd(4_000),
  tenureMonths: 60,
  reference: 'v-nissan-patrol-2021',
  idempotencyKey: 'key-patrol-01',
};
// Affordable: approved automatically.
const small: ApplicationRequest = { ...patrol, assetPriceFils: bhd(5_000), downPaymentFils: bhd(1_000), idempotencyKey: 'key-small-001' };

function clock(start = Date.UTC(2026, 9, 3, 6, 0, 0)) {
  let t = start;
  return { now: () => new Date(t), tick: (ms: number) => (t += ms) };
}

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as BackOfficeError).code ?? (e as Error).name;
  }
  return undefined;
}

async function codeAsync(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e) {
    return (e as BackOfficeError).code ?? (e as Error).name;
  }
  return undefined;
}

function referred(svc: SandboxOriginationService, customerId = 'cus_a', req = patrol) {
  const app = svc.apply(req, applicant, customerId);
  expect(app.status).toBe('REFERRED');
  return app;
}

// A referred application a credit officer approves must continue exactly like an automatically approved one.
describe('approved referrals continue like automatic approvals', () => {
  const homeApplicant: CustomerFinancials = { monthlySalaryFils: bhd(1_300), existingObligationsFils: 0 };

  it('vehicle Murabaha: the full Murabaha sequence is still to come, and accepting runs it in order', () => {
    const c = clock();
    const svc = new SandboxOriginationService(c.now);
    const app = referred(svc, 'cus_a', { ...patrol, structure: 'murabaha', idempotencyKey: 'key-patrol-mur' });
    // Referred: nothing planned after the decision.
    expect(applicationSteps(app).map((s) => s.status)).toEqual(['DRAFT', 'SUBMITTED', 'REFERRED']);
    const r = decideReferred(officer, svc, new AuditLog(c.now), app.id, { outcome: 'APPROVED', note: 'Verified salary' });
    const upcoming = applicationSteps(r.application).filter((s) => !s.done);
    expect(upcoming.map((s) => s.status)).toEqual(fulfilmentPath('vehicle', 'murabaha'));
    expect(upcoming.filter((s) => s.murabaha).map((s) => s.status)).toEqual(['ASSET_PURCHASED_BY_BCFC', 'OWNERSHIP_TRANSFERRED_TO_BCFC', 'SALE_TO_CUSTOMER']);
    const accepted = svc.accept(app.id, 'cus_a');
    expect(accepted.status).toBe('COMPLETED');
    expect(accepted.timeline.map((e) => e.status)).toEqual(['DRAFT', 'SUBMITTED', 'REFERRED', 'APPROVED', ...fulfilmentPath('vehicle', 'murabaha')]);
    expect(applicationSteps(accepted).every((s) => s.done)).toBe(true);
  });

  it('home Ijara: Ijara steps to come; accepting stops at LEASE_STARTED with ownership transfer still to come', () => {
    const c = clock();
    const svc = new SandboxOriginationService(c.now);
    const req = homeApplicationRequest({ structure: 'ijara', propertyId: 'p-amwaj-apt-2br', downPaymentFils: bhd(19_600), tenureMonths: 240, idempotencyKey: 'key-home-ref-1' });
    const app = svc.apply(req, homeApplicant, 'cus_h');
    expect(app.status).toBe('REFERRED');
    const r = decideReferred(officer, svc, new AuditLog(c.now), app.id, { outcome: 'APPROVED', note: 'Verified salary' });
    const upcoming = applicationSteps(r.application).filter((s) => !s.done);
    expect(upcoming.map((s) => s.status)).toEqual(fulfilmentPath('home', 'ijara'));
    expect(upcoming.filter((s) => s.ijara).map((s) => s.status)).toEqual(['ASSET_PURCHASED_BY_BCFC', 'LEASE_STARTED', 'OWNERSHIP_TRANSFERRED_TO_CUSTOMER']);
    expect(upcoming.some((s) => s.murabaha)).toBe(false);
    const accepted = svc.accept(app.id, 'cus_h');
    expect(accepted.status).toBe('LEASE_STARTED');
    expect(applicationSteps(accepted).filter((s) => !s.done).map((s) => s.status)).toEqual(['OWNERSHIP_TRANSFERRED_TO_CUSTOMER', 'COMPLETED']);
  });

  it('home conventional: after review and accept it waits for the valuation fee (nextAction, not yet paid)', () => {
    const c = clock();
    const svc = new SandboxOriginationService(c.now);
    const req = homeApplicationRequest({ structure: 'conventional', propertyId: 'p-amwaj-apt-2br', downPaymentFils: bhd(19_600), tenureMonths: 240, idempotencyKey: 'key-home-ref-2' });
    const app = svc.apply(req, homeApplicant, 'cus_h');
    decideReferred(officer, svc, new AuditLog(c.now), app.id, { outcome: 'APPROVED', note: 'Verified salary' });
    const signed = svc.accept(app.id, 'cus_h');
    expect(signed.status).toBe('CONTRACT_SIGNED');
    expect(applicationView(signed).nextAction).toMatchObject({ type: 'PAY_VALUATION_FEE', feePaid: false });
    expect(svc.accept(app.id, 'cus_h', { valuationPaymentId: 'pay_x' }).status).toBe('COMPLETED');
  });

  it('the credit queue and KPIs include home finance (property id as reference, Ijara structure)', () => {
    const c = clock();
    const svc = new SandboxOriginationService(c.now);
    const req = homeApplicationRequest({ structure: 'ijara', propertyId: 'p-amwaj-apt-2br', downPaymentFils: bhd(19_600), tenureMonths: 240, idempotencyKey: 'key-home-ref-3' });
    svc.apply(req, homeApplicant, 'cus_h');
    const [item] = creditQueue(officer, svc.listAll(), () => undefined);
    expect(item).toMatchObject({ productLine: 'home', structure: 'ijara', reference: 'p-amwaj-apt-2br', financials: { monthlySalaryFils: bhd(1_300) } });
    const k = backOfficeKpis(officer, svc.listAll(), [], () => false, c.now());
    expect(k).toMatchObject({ referredPending: 1, applicationsTodayTotal: 1, applicationsToday: { REFERRED: 1 } });
  });
});

describe('staff auth and roles', () => {
  it('sandbox sign-in needs a known role (401 otherwise)', () => {
    const auth = new SandboxStaffAuth();
    expect(auth.authenticate({ role: 'operations' })).toEqual(ops);
    expect(code(() => auth.authenticate({ role: null }))).toBe('UNAUTHENTICATED');
    expect(code(() => auth.authenticate({ role: 'admin' }))).toBe('UNAUTHENTICATED');
  });

  it('least privilege: only credit officers decide; operations never sees applications; only compliance reads the audit log', () => {
    expect(STAFF_ROLES.filter((r) => can(r, 'applications.decide'))).toEqual(['credit_officer']);
    expect(STAFF_ROLES.filter((r) => can(r, 'applications.read'))).toEqual(['credit_officer', 'compliance']);
    expect(STAFF_ROLES.filter((r) => can(r, 'refunds.execute'))).toEqual(['operations']);
    expect(STAFF_ROLES.filter((r) => can(r, 'audit.read'))).toEqual(['compliance']);
    expect(STAFF_ROLES.every((r) => ROLE_PERMISSIONS[r].includes('dashboard.read'))).toBe(true);
    expect(code(() => assertPermission(ops, 'applications.read'))).toBe('FORBIDDEN');
  });

  it('maps role failures to 401 / 403 and decision errors to 4xx', async () => {
    const status = (e: unknown) => handleBackOfficeError(e).status;
    expect(status(new BackOfficeError('UNAUTHENTICATED', 'x'))).toBe(401);
    expect(status(new BackOfficeError('FORBIDDEN', 'x'))).toBe(403);
    expect(status(Object.assign(new Error('x'), { name: 'BackOfficeError', code: 'FORBIDDEN' }))).toBe(403);
    expect(status(new BackOfficeError('NOTE_REQUIRED', 'x'))).toBe(422);
    expect(status(new BackOfficeError('NOT_REFERRED', 'x'))).toBe(409);
    expect(status(new BackOfficeError('POLICY_BOUND', 'x'))).toBe(409);
    expect(status(new ApplicationTransitionError('APPROVED', 'DECLINED', 'conventional'))).toBe(409);
  });
});

describe('credit review queue', () => {
  it('lists REFERRED applications of every customer, first in first out, with first name and masked CPR only', () => {
    const c = clock();
    const svc = new SandboxOriginationService(c.now);
    const a = referred(svc, 'cus_a');
    c.tick(60_000);
    const b = referred(svc, 'cus_b');
    svc.apply(small, applicant, 'cus_c'); // approved automatically: not in the queue
    const profiles: Record<string, CustomerProfile> = {
      cus_b: withIdentity(newCustomerProfile('cus_b'), {
        name: { en: 'Yusuf Ali Hassan', ar: 'يوسف علي حسن' },
        cprMasked: '*****6789',
        nationality: { en: 'Bahraini', ar: 'بحريني' },
        provider: 'sandbox',
      } as never),
    };
    const q = creditQueue(officer, svc.listAll(), (id) => profiles[id]);
    expect(q.map((x) => x.id)).toEqual([a.id, b.id]);
    expect(q[0]!.firstName.en).toBe('Fatima'); // session gone / no eKey: demo customer
    expect(q[0]!.cprMasked).toBeUndefined();
    expect(q[1]!.firstName).toEqual({ en: 'Yusuf', ar: 'يوسف' });
    expect(q[1]!.cprMasked).toBe('*****6789');
    expect(q[0]!.reasons).toContain('HIGH_DBR_UTILISATION');
    expect(q[0]!.monthlyFils).toBe(a.decision!.monthlyFils);
    expect(q[0]!.dbrAfterPct).toBe(a.decision!.dbrAfterPct);
    expect(JSON.stringify(q)).not.toContain('Hassan');
  });

  it('data minimization: salary and obligations only for credit officers; operations cannot read the queue', () => {
    const svc = new SandboxOriginationService();
    referred(svc);
    expect(creditQueue(officer, svc.listAll(), () => undefined)[0]!.financials).toEqual({
      monthlySalaryFils: bhd(1_400),
      existingObligationsFils: 326_753,
      maxMonthlyFils: expect.any(Number),
      preApprovedLimitFils: expect.any(Number),
    });
    const forCompliance = creditQueue(compliance, svc.listAll(), () => undefined)[0]!;
    expect(forCompliance.financials).toBeUndefined();
    expect(JSON.stringify(forCompliance)).not.toContain(String(bhd(1_400)));
    expect(code(() => creditQueue(ops, svc.listAll(), () => undefined))).toBe('FORBIDDEN');
  });

  it('approve: REFERRED → APPROVED with an audit entry; the customer sees a credit officer reviewed it and can accept', () => {
    const c = clock();
    const svc = new SandboxOriginationService(c.now);
    const audit = new AuditLog(c.now);
    const app = referred(svc);
    c.tick(5 * 60_000);
    const r = decideReferred(officer, svc, audit, app.id, { outcome: 'APPROVED', note: '  Stable employer, low risk  ' });
    expect(r.replayed).toBe(false);
    expect(r.application.status).toBe('APPROVED');
    expect(r.application.review).toEqual({ outcome: 'APPROVED', reviewedBy: 'CREDIT_OFFICER', reviewedAt: r.audit.at });
    expect(r.application.timeline.at(-1)).toMatchObject({ status: 'APPROVED', by: 'CREDIT_OFFICER' });
    expect(r.audit).toMatchObject({
      type: 'APPLICATION_APPROVED',
      staffId: officer.staffId,
      role: 'credit_officer',
      note: 'Stable employer, low risk',
      subject: { kind: 'application', id: app.id },
      amountFils: app.quote.financedFils,
    });
    // The customer's timeline: the officer's step, then the fulfilment still to come.
    const steps = applicationSteps(r.application);
    expect(steps.find((s) => s.status === 'APPROVED')).toMatchObject({ done: true, by: 'CREDIT_OFFICER' });
    expect(steps.some((s) => s.status === 'COMPLETED' && !s.done)).toBe(true);
    // The internal note is never on the customer's application.
    expect(JSON.stringify(r.application)).not.toContain('Stable employer');
    expect(svc.accept(app.id, 'cus_a').status).toBe('COMPLETED');
  });

  it('decline: REFERRED → DECLINED; repeating the decision is idempotent; a different one is 409', () => {
    const svc = new SandboxOriginationService();
    const audit = new AuditLog();
    const app = referred(svc);
    const first = decideReferred(officer, svc, audit, app.id, { outcome: 'DECLINED', note: 'Income not verified' });
    expect(first.application.status).toBe('DECLINED');
    expect(applicationSteps(first.application).every((s) => s.done)).toBe(true);
    const again = decideReferred(officer, svc, audit, app.id, { outcome: 'DECLINED', note: 'Income not verified' });
    expect(again).toMatchObject({ replayed: true, audit: first.audit });
    expect(code(() => decideReferred(officer, svc, audit, app.id, { outcome: 'APPROVED', note: 'Changed my mind' }))).toBe('NOT_REFERRED');
    expect(audit.list()).toHaveLength(1);
  });

  it('refuses: wrong role, missing note, bad outcome, unknown or not-referred application', () => {
    const svc = new SandboxOriginationService();
    const audit = new AuditLog();
    const app = referred(svc);
    const approvedApp = svc.apply(small, applicant, 'cus_a');
    expect(code(() => decideReferred(compliance, svc, audit, app.id, { outcome: 'APPROVED', note: 'Looks fine' }))).toBe('FORBIDDEN');
    expect(code(() => decideReferred(ops, svc, audit, app.id, { outcome: 'APPROVED', note: 'Looks fine' }))).toBe('FORBIDDEN');
    expect(code(() => decideReferred(officer, svc, audit, app.id, { outcome: 'APPROVED' }))).toBe('NOTE_REQUIRED');
    expect(code(() => decideReferred(officer, svc, audit, app.id, { outcome: 'APPROVED', note: '  ok  ' }))).toBe('NOTE_REQUIRED');
    expect(code(() => decideReferred(officer, svc, audit, app.id, { outcome: 'REFERRED', note: 'Looks fine' }))).toBe('INVALID_REQUEST');
    expect(code(() => decideReferred(officer, svc, audit, 'app_nope', { outcome: 'APPROVED', note: 'Looks fine' }))).toBe('APPLICATION_NOT_FOUND');
    expect(code(() => decideReferred(officer, svc, audit, approvedApp.id, { outcome: 'DECLINED', note: 'Looks fine' }))).toBe('NOT_REFERRED');
    // The origination state machine itself only lets a review leave REFERRED.
    expect(() => svc.review(approvedApp.id, 'DECLINED')).toThrow(ApplicationTransitionError);
    expect(audit.list()).toEqual([]);
    expect(svc.get(app.id)!.status).toBe('REFERRED');
  });
});

describe('refund queue (captured premiums without a policy)', () => {
  const NOW = new Date(Date.UTC(2026, 9, 3, 9, 0));
  const travel: PolicyQuoteRequest = {
    line: 'travel',
    insurerId: 'pearl-takaful',
    input: { region: 'gcc', tier: 'basic', startDate: '2026-10-10', endDate: '2026-10-16', adults: 1, children: 0 },
  };

  async function setup() {
    const gateway = new SandboxPaymentGateway();
    const policies = new SandboxPolicyStore(() => NOW);
    const quote = policies.createQuote('cus_a', travel);
    const pay = async (key: string) => {
      const p = await gateway.createCharge(
        { amountFils: quote.premiumFils, method: 'card', purpose: 'insurance_premium', reference: quote.id, idempotencyKey: key },
        'cus_a',
      );
      return gateway.confirm(p.id, 'cus_a');
    };
    const bound = await pay('premium-key-1');
    policies.confirm('cus_a', bound, quote.id);
    // Paid twice (e.g. a retried checkout): the second premium can never bind (ALREADY_BOUND).
    const orphan = await pay('premium-key-2');
    // A premium the app never confirmed (closed after paying).
    const never = await pay('premium-key-3');
    // Not a premium: never in the queue.
    await gateway.confirm(
      (await gateway.createCharge({ amountFils: 100_000, method: 'card', purpose: 'reservation_deposit', reference: 'v-1', idempotencyKey: 'deposit-key-1' }, 'cus_a')).id,
      'cus_a',
    );
    const isBound: PolicyBoundCheck = (p, owner) => owner !== undefined && policies.list(owner).some((x) => x.paymentId === p.id);
    return { gateway, policies, bound, orphan, never, isBound, audit: new AuditLog(() => NOW) };
  }

  it('lists captured insurance premiums with no policy (payment data only), for operations and compliance', async () => {
    const { gateway, orphan, never, isBound } = await setup();
    const q = refundQueue(ops, gateway.listAll(), isBound);
    expect(q.map((r) => r.paymentId).sort()).toEqual([orphan.id, never.id].sort());
    expect(Object.keys(q[0]!).sort()).toEqual(['ageMinutes', 'amountFils', 'capturedAt', 'method', 'paymentId', 'quoteId']);
    expect(refundQueue(compliance, gateway.listAll(), isBound)).toHaveLength(2);
    expect(code(() => refundQueue(officer, gateway.listAll(), isBound))).toBe('FORBIDDEN');
    // With a minimum age, fresh payments are not refundable yet (the app may still bind them).
    expect(refundQueue(ops, gateway.listAll(), isBound, new Date(), 30 * 60_000)).toEqual([]);
  });

  it('refunds CAPTURED → REFUNDED once, with an audit entry; a repeated refund is idempotent', async () => {
    const { gateway, orphan, isBound, audit } = await setup();
    const r = await refundOrphanPremium(ops, gateway, audit, orphan.id, isBound, { note: 'Duplicate payment' });
    expect(r.replayed).toBe(false);
    expect(r.payment.status).toBe('REFUNDED');
    expect(r.audit).toMatchObject({ type: 'PAYMENT_REFUNDED', role: 'operations', amountFils: orphan.amountFils, note: 'Duplicate payment', subject: { kind: 'payment', id: orphan.id } });
    const again = await refundOrphanPremium(ops, gateway, audit, orphan.id, isBound);
    expect(again).toMatchObject({ replayed: true, audit: r.audit });
    expect(audit.list('PAYMENT_REFUNDED')).toHaveLength(1);
    expect(refundQueue(ops, gateway.listAll(), isBound).map((x) => x.paymentId)).not.toContain(orphan.id);
    // The gateway refund itself is idempotent too.
    expect((await gateway.refund(orphan.id)).status).toBe('REFUNDED');
  });

  it('never refunds a premium bound to a policy, a non-premium, or for the wrong role; a refunded premium cannot bind', async () => {
    const { gateway, policies, bound, never, isBound, audit } = await setup();
    expect(await codeAsync(refundOrphanPremium(ops, gateway, audit, bound.id, isBound))).toBe('POLICY_BOUND');
    const deposit = gateway.listAll().find((x) => x.payment.purpose === 'reservation_deposit')!.payment;
    expect(await codeAsync(refundOrphanPremium(ops, gateway, audit, deposit.id, isBound))).toBe('NOT_REFUNDABLE');
    expect(await codeAsync(refundOrphanPremium(ops, gateway, audit, 'pay_nope', isBound))).toBe('PAYMENT_NOT_FOUND');
    expect(await codeAsync(refundOrphanPremium(officer, gateway, audit, never.id, isBound))).toBe('FORBIDDEN');
    expect(await codeAsync(refundOrphanPremium(compliance, gateway, audit, never.id, isBound))).toBe('FORBIDDEN');
    expect(await codeAsync(refundOrphanPremium(ops, gateway, audit, never.id, isBound, { now: NOW, minAgeMs: Number.MAX_SAFE_INTEGER }))).toBe('NOT_REFUNDABLE');
    expect(audit.list()).toEqual([]);

    await refundOrphanPremium(ops, gateway, audit, never.id, isBound);
    // The customer's app confirming the refunded premium later gets no policy.
    expect(code(() => policies.confirm('cus_a', gateway.get(never.id, 'cus_a'), never.reference))).toBe('PAYMENT_NOT_CAPTURED');
  });
});

describe('audit log and KPIs', () => {
  it('audit log: compliance only, newest first, filterable by type, append-only', async () => {
    const svc = new SandboxOriginationService();
    const audit = new AuditLog();
    audit.append(officer, { type: 'STAFF_SIGNED_IN' });
    const a = referred(svc, 'cus_a');
    const b = referred(svc, 'cus_b');
    decideReferred(officer, svc, audit, a.id, { outcome: 'APPROVED', note: 'Approved after review' });
    decideReferred(officer, svc, audit, b.id, { outcome: 'DECLINED', note: 'Declined after review' });
    const all = auditEntries(compliance, audit);
    expect(all.map((e) => e.type)).toEqual(['APPLICATION_DECLINED', 'APPLICATION_APPROVED', 'STAFF_SIGNED_IN']);
    expect(auditEntries(compliance, audit, 'APPLICATION_APPROVED').map((e) => e.subject?.id)).toEqual([a.id]);
    expect(code(() => auditEntries(officer, audit))).toBe('FORBIDDEN');
    expect(code(() => auditEntries(ops, audit))).toBe('FORBIDDEN');
    expect(Object.isFrozen(all[0])).toBe(true);
  });

  it('KPIs: today by status, approval rate, average decision and review time, refunds pending', () => {
    const c = clock();
    const svc = new SandboxOriginationService(c.now);
    const audit = new AuditLog(c.now);
    svc.apply(small, applicant, 'cus_a'); // approved automatically
    const r1 = referred(svc, 'cus_b');
    const r2 = referred(svc, 'cus_c');
    referred(svc, 'cus_d'); // still waiting
    c.tick(10 * 60_000);
    decideReferred(officer, svc, audit, r1.id, { outcome: 'APPROVED', note: 'Approved after review' });
    c.tick(10 * 60_000);
    decideReferred(officer, svc, audit, r2.id, { outcome: 'DECLINED', note: 'Declined after review' });

    const k = backOfficeKpis(ops, svc.listAll(), [], () => false, c.now());
    expect(k.date).toBe('2026-10-03');
    expect(k.applicationsToday).toEqual({ APPROVED: 2, DECLINED: 1, REFERRED: 1 });
    expect(k.applicationsTodayTotal).toBe(4);
    // 2 approved (one automatically, one by an officer) of 3 decided.
    expect(k.approvalRatePct).toBe(66.7);
    expect(k.avgReviewMinutes).toBe(15);
    expect(k.avgDecisionMinutes).toBeGreaterThan(0);
    expect(k.referredPending).toBe(1);
    expect(k.refundsPending).toBe(0);
    // Every role sees the dashboard.
    for (const s of [officer, compliance]) expect(backOfficeKpis(s, [], [], () => false).approvalRatePct).toBeNull();
  });
});
