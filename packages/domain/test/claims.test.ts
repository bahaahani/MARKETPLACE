import { describe, expect, it } from 'vitest';
import {
  bhd,
  CLAIM_MAX_PHOTO_BYTES,
  CLAIM_MAX_PHOTOS,
  CLAIM_STATUSES,
  CLAIM_TRANSITIONS,
  canTransition,
  claimRules,
  claimView,
  clientConfig,
  DEMO_GARAGES,
  demoCustomer,
  estimateDamage,
  garageOptions,
  parseIncidentAt,
  replacementCarOffer,
  SandboxClaimStore,
  SandboxPolicyStore,
  sniffImageType,
  validateClaim,
  validateClaimPhoto,
  type Claim,
  type ClaimInput,
  type ClaimStatus,
  type Payment,
  type Policy,
} from '../src';

// 2026-10-03 10:00 UTC = 13:00 in Bahrain.
const NOW = new Date(Date.UTC(2026, 9, 3, 10, 0));

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(8)]);
const GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(14)]);
const b64 = (b: Buffer) => b.toString('base64');

function motorPolicy(over: Partial<Policy> = {}, cover: Partial<Extract<Policy['cover'], { line: 'motor' }>> = {}): Policy {
  return {
    id: 'pol_motor_1',
    policyNumber: 'SBX-MTR-26-000001',
    customerId: 'cus_a',
    line: 'motor',
    insurerId: 'pearl-takaful',
    insurerName: { en: 'Pearl Takaful (demo)', ar: 'بيرل للتكافل (تجريبي)' },
    takaful: true,
    premiumFils: bhd(300),
    cover: { line: 'motor', cover: 'comprehensive', vehicleValueFils: bhd(14_900), agencyRepair: false, reference: '123456', ...cover },
    startDate: '2026-09-01',
    endDate: '2027-08-31',
    status: 'ACTIVE',
    quoteId: 'pq_1',
    paymentId: 'pay_1',
    issuedAt: '2026-08-31T21:00:00.000Z',
    ...over,
  };
}

const input = (over: Partial<ClaimInput> = {}): ClaimInput => ({
  policyId: 'pol_motor_1',
  incidentAt: '2026-10-03T08:30', // Bahrain local time
  location: 'Sheikh Khalifa Highway, near Isa Town',
  type: 'collision',
  severity: 'moderate',
  description: 'Rear-ended at a traffic light, bumper and boot damaged.',
  thirdPartyInvolved: true,
  photos: [{ mimeType: 'image/jpeg', dataBase64: b64(JPEG) }],
  ...over,
});

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
}

describe('photo validation (magic bytes, size)', () => {
  it('detects JPEG, PNG and WebP from the bytes', () => {
    expect(sniffImageType(JPEG)).toBe('image/jpeg');
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(WEBP)).toBe('image/webp');
    expect(sniffImageType(GIF)).toBeUndefined();
  });
  it('keeps only type and size; the label must match the bytes', () => {
    expect(validateClaimPhoto({ dataBase64: b64(PNG) }, 0)).toEqual({ index: 0, mimeType: 'image/png', bytes: PNG.length });
    expect(validateClaimPhoto({ mimeType: 'image/jpg', dataBase64: b64(JPEG) }, 1).mimeType).toBe('image/jpeg');
    expect(validateClaimPhoto({ dataBase64: `data:image/webp;base64,${b64(WEBP)}` }, 0).mimeType).toBe('image/webp');
    expect(code(() => validateClaimPhoto({ mimeType: 'image/png', dataBase64: b64(JPEG) }, 0))).toBe('PHOTO_INVALID');
    expect(code(() => validateClaimPhoto({ dataBase64: `data:image/png;base64,${b64(JPEG)}` }, 0))).toBe('PHOTO_INVALID');
  });
  it('rejects other formats, bad base64 and tiny files', () => {
    expect(code(() => validateClaimPhoto({ dataBase64: b64(GIF) }, 0))).toBe('PHOTO_INVALID');
    expect(code(() => validateClaimPhoto({ dataBase64: b64(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')) }, 0))).toBe('PHOTO_INVALID');
    expect(code(() => validateClaimPhoto({ dataBase64: '!!!notbase64' }, 0))).toBe('PHOTO_INVALID');
    expect(code(() => validateClaimPhoto({ dataBase64: b64(JPEG.subarray(0, 6)) }, 0))).toBe('PHOTO_INVALID');
    expect(code(() => validateClaimPhoto(null, 0))).toBe('PHOTO_INVALID');
    expect(code(() => validateClaimPhoto({ dataBase64: 42 }, 0))).toBe('PHOTO_INVALID');
  });
  it('rejects photos over the size cap without decoding them', () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(CLAIM_MAX_PHOTO_BYTES)]);
    expect(code(() => validateClaimPhoto({ dataBase64: b64(big) }, 0))).toBe('PHOTO_TOO_LARGE');
    const atCap = Buffer.concat([JPEG, Buffer.alloc(CLAIM_MAX_PHOTO_BYTES - JPEG.length)]);
    expect(validateClaimPhoto({ dataBase64: b64(atCap) }, 0).bytes).toBe(CLAIM_MAX_PHOTO_BYTES);
  });
});

describe('claim validation', () => {
  const policies = [motorPolicy()];

  it('accepts a collision and stores the Bahrain incident date and the estimate', () => {
    const c = validateClaim(input({ latitude: 26.1734567, longitude: 50.5476543 }), policies, NOW);
    expect(c.incidentAt).toBe('2026-10-03T05:30:00.000Z');
    expect(c.incidentDate).toBe('2026-10-03');
    expect(c.vehicleReference).toBe('123456');
    expect(c.latitude).toBe(26.17346);
    expect(c.photos).toEqual([{ index: 0, mimeType: 'image/jpeg', bytes: JPEG.length }]);
    expect(c.estimate.estimateFils).toBe(bhd(600));
    expect(c.estimate.ai).toBe(false);
    expect(JSON.stringify(c)).not.toContain(b64(JPEG)); // photo bytes are not kept
  });

  it('reads times with an offset as instants and without one as Bahrain time', () => {
    expect(parseIncidentAt('2026-10-03T08:30')).toBe(Date.UTC(2026, 9, 3, 5, 30));
    expect(parseIncidentAt('2026-10-03T05:30:00.000Z')).toBe(Date.UTC(2026, 9, 3, 5, 30));
    for (const bad of ['2026-02-30T10:00', '2026-10-03', '2026-10-03T24:00', 'yesterday', 42]) {
      expect(code(() => parseIncidentAt(bad)), String(bad)).toBe('INVALID_INCIDENT_TIME');
    }
    // 2026-10-03 22:30 UTC is already 4 October in Bahrain.
    expect(validateClaim(input({ incidentAt: '2026-10-03T22:30:00Z' }), policies, new Date(Date.UTC(2026, 9, 3, 23))).incidentDate).toBe('2026-10-04');
  });

  it('rejects future incidents, incidents outside the policy period and old ones', () => {
    expect(code(() => validateClaim(input({ incidentAt: '2026-10-03T13:05' }), policies, NOW))).toBe('INCIDENT_IN_FUTURE');
    expect(validateClaim(input({ incidentAt: '2026-10-03T13:00' }), policies, NOW).incidentDate).toBe('2026-10-03');
    expect(code(() => validateClaim(input({ incidentAt: '2026-08-31T23:59' }), policies, NOW))).toBe('INCIDENT_OUTSIDE_POLICY');
    expect(validateClaim(input({ incidentAt: '2026-09-03T00:00' }), policies, NOW).incidentDate).toBe('2026-09-03');
    expect(code(() => validateClaim(input({ incidentAt: '2026-09-02T23:59' }), policies, NOW))).toBe('INCIDENT_TOO_OLD');
    // A policy bought today covers from the minute it was issued.
    const fresh = [motorPolicy({ startDate: '2026-10-03', issuedAt: '2026-10-03T07:15:40.000Z' })];
    expect(code(() => validateClaim(input({ incidentAt: '2026-10-03T10:14' }), fresh, NOW))).toBe('INCIDENT_OUTSIDE_POLICY');
    expect(validateClaim(input({ incidentAt: '2026-10-03T10:15' }), fresh, NOW).incidentAt).toBe('2026-10-03T07:15:00.000Z');
  });

  it('only for an active motor policy of this customer', () => {
    expect(code(() => validateClaim(input({ policyId: 'pol_other' }), policies, NOW))).toBe('POLICY_NOT_FOUND');
    expect(code(() => validateClaim(input(), [motorPolicy({ status: 'EXPIRED' })], NOW))).toBe('POLICY_NOT_ACTIVE');
    const travel = { ...motorPolicy(), cover: { line: 'travel', region: 'gcc', tier: 'basic', adults: 1, children: 0, days: 5, medicalCoverFils: 1 } } as Policy;
    expect(code(() => validateClaim(input(), [travel], NOW))).toBe('NOT_MOTOR_POLICY');
    expect(code(() => validateClaim(input({ policyId: undefined as unknown as string }), policies, NOW))).toBe('INVALID_REQUEST');
  });

  it('third-party cover: only damage to a third party', () => {
    const tp = [motorPolicy({}, { cover: 'third-party' })];
    expect(validateClaim(input(), tp, NOW).cover).toBe('third-party');
    expect(code(() => validateClaim(input({ thirdPartyInvolved: false }), tp, NOW))).toBe('NOT_COVERED');
    expect(code(() => validateClaim(input({ type: 'glass' }), tp, NOW))).toBe('NOT_COVERED');
  });

  it('checks type, severity, location, description and the police report', () => {
    expect(code(() => validateClaim(input({ type: 'flood' as never }), policies, NOW))).toBe('INVALID_REQUEST');
    expect(code(() => validateClaim(input({ severity: 'huge' as never }), policies, NOW))).toBe('INVALID_REQUEST');
    expect(code(() => validateClaim(input({ thirdPartyInvolved: 'yes' as never }), policies, NOW))).toBe('INVALID_REQUEST');
    expect(code(() => validateClaim(input({ location: '  a ' }), policies, NOW))).toBe('INVALID_LOCATION');
    expect(code(() => validateClaim(input({ location: 'x'.repeat(201) }), policies, NOW))).toBe('INVALID_LOCATION');
    expect(code(() => validateClaim(input({ latitude: 26.1 }), policies, NOW))).toBe('INVALID_LOCATION');
    expect(code(() => validateClaim(input({ latitude: 91, longitude: 50 }), policies, NOW))).toBe('INVALID_LOCATION');
    expect(code(() => validateClaim(input({ description: 'short' }), policies, NOW))).toBe('INVALID_DESCRIPTION');
    expect(code(() => validateClaim(input({ description: 'x'.repeat(1001) }), policies, NOW))).toBe('INVALID_DESCRIPTION');
    expect(code(() => validateClaim(input({ policeReportNumber: '<script>' }), policies, NOW))).toBe('INVALID_POLICE_REPORT');
    expect(validateClaim(input({ policeReportNumber: ' ' }), policies, NOW).policeReportNumber).toBeUndefined();
    expect(validateClaim(input({ policeReportNumber: 'TR/2026-0042' }), policies, NOW).policeReportNumber).toBe('TR/2026-0042');
  });

  it('theft needs a police report number but no photos', () => {
    const theft = input({ type: 'theft', photos: [], thirdPartyInvolved: false });
    expect(code(() => validateClaim(theft, policies, NOW))).toBe('POLICE_REPORT_REQUIRED');
    const ok = validateClaim({ ...theft, policeReportNumber: 'PR-1234' }, policies, NOW);
    expect(ok.estimate.totalLoss).toBe(true);
  });

  it('photos: at least one for damage, at most the cap', () => {
    expect(code(() => validateClaim(input({ photos: [] }), policies, NOW))).toBe('PHOTOS_REQUIRED');
    expect(code(() => validateClaim(input({ photos: undefined }), policies, NOW))).toBe('PHOTOS_REQUIRED');
    const many = Array.from({ length: CLAIM_MAX_PHOTOS + 1 }, () => ({ dataBase64: b64(PNG) }));
    expect(code(() => validateClaim(input({ photos: many }), policies, NOW))).toBe('TOO_MANY_PHOTOS');
    expect(code(() => validateClaim(input({ photos: [{ dataBase64: b64(GIF) }] }), policies, NOW))).toBe('PHOTO_INVALID');
    expect(code(() => validateClaim(input({ photos: 'x' as never }), policies, NOW))).toBe('INVALID_REQUEST');
  });
});

describe('sandbox damage estimate (rules, not AI)', () => {
  const value = bhd(14_900);
  it('is a fixed table by type and severity with a ±20% range', () => {
    expect(estimateDamage('collision', 'minor', value)).toEqual({
      method: 'SANDBOX_RULES',
      ai: false,
      estimateFils: bhd(150),
      lowFils: bhd(120),
      highFils: bhd(180),
      totalLoss: false,
      repairDays: 2,
    });
    expect(estimateDamage('glass', 'moderate', value).estimateFils).toBe(bhd(120));
    expect(estimateDamage('other', 'severe', value).repairDays).toBe(7);
  });
  it('theft and severe fire are a total loss at the vehicle value; estimates never exceed it', () => {
    for (const e of [estimateDamage('theft', 'minor', value), estimateDamage('fire', 'severe', value)]) {
      expect(e).toMatchObject({ totalLoss: true, estimateFils: value, lowFils: value, highFils: value, repairDays: 0 });
    }
    expect(estimateDamage('collision', 'severe', bhd(2_000))).toMatchObject({ totalLoss: true, estimateFils: bhd(2_000) });
    expect(estimateDamage('collision', 'severe', bhd(2_800)).highFils).toBe(bhd(2_800));
  });
  it('is the same for the same input (deterministic, integer fils)', () => {
    const a = estimateDamage('collision', 'moderate', value);
    expect(estimateDamage('collision', 'moderate', value)).toEqual(a);
    expect(Number.isSafeInteger(a.lowFils) && Number.isSafeInteger(a.highFils)).toBe(true);
  });
});

describe('status machine', () => {
  const claim = (status: ClaimStatus, totalLoss = false) => ({ status, estimate: { ...estimateDamage('collision', 'minor', bhd(10_000)), totalLoss } });

  it('allows only the documented transitions', () => {
    const allowed: [ClaimStatus, ClaimStatus][] = [];
    for (const from of CLAIM_STATUSES) for (const to of CLAIM_STATUSES) if (canTransition(claim(from), to)) allowed.push([from, to]);
    expect(allowed).toEqual([
      ['SUBMITTED', 'UNDER_ASSESSMENT'],
      ['UNDER_ASSESSMENT', 'APPROVED'],
      ['UNDER_ASSESSMENT', 'REJECTED'],
      ['APPROVED', 'REPAIR_BOOKED'],
      ['REPAIR_BOOKED', 'SETTLED'],
    ]);
    expect(CLAIM_TRANSITIONS.REJECTED).toEqual([]);
    expect(CLAIM_TRANSITIONS.SETTLED).toEqual([]);
  });
  it('a total loss is settled without a repair', () => {
    expect(canTransition(claim('APPROVED', true), 'SETTLED')).toBe(true);
    expect(canTransition(claim('APPROVED', true), 'REPAIR_BOOKED')).toBe(false);
  });
});

describe('SandboxClaimStore', () => {
  function setup() {
    let now = NOW;
    const policies: Record<string, Policy[]> = {
      cus_a: [motorPolicy(), motorPolicy({ id: 'pol_agency', policyNumber: 'SBX-MTR-26-000002' }, { agencyRepair: true })],
      cus_b: [motorPolicy({ id: 'pol_b', customerId: 'cus_b' })],
    };
    const store = new SandboxClaimStore((c) => policies[c] ?? [], () => now);
    return { store, tick: (ms: number) => (now = new Date(now.getTime() + ms)) };
  }

  it('files a claim with a claim number, SUBMITTED, private to the customer', () => {
    const { store } = setup();
    const c = store.file('cus_a', input());
    expect(c.claimNumber).toBe('SBX-CLM-26-000001');
    expect(c.id).toMatch(/^clm_sbx_/);
    expect(c.status).toBe('SUBMITTED');
    expect(c.history).toEqual([{ status: 'SUBMITTED', at: NOW.toISOString() }]);
    expect(store.get(c.id, 'cus_a')).toEqual(c);
    expect(store.get(c.id, 'cus_b')).toBeUndefined();
    expect(store.list('cus_b')).toEqual([]);
    expect(code(() => store.advance(c.id, 'cus_b'))).toBe('CLAIM_NOT_FOUND');
    expect(code(() => store.bookGarage(c.id, 'cus_b', 'g-sitra-auto-works'))).toBe('CLAIM_NOT_FOUND');
    // Another customer's policy reads as unknown.
    expect(code(() => store.file('cus_b', input()))).toBe('POLICY_NOT_FOUND');
  });

  it('a repeated idempotency key returns the original claim', () => {
    const { store } = setup();
    const a = store.file('cus_a', input(), 'key-1');
    expect(store.file('cus_a', input({ description: 'Something else entirely here' }), 'key-1')).toEqual(a);
    expect(store.file('cus_b', input({ policyId: 'pol_b' }), 'key-1').id).not.toBe(a.id);
    expect(store.list('cus_a')).toHaveLength(1);
  });

  it('runs assessment → approval → garage → settled, recording the timeline', () => {
    const { store, tick } = setup();
    const c = store.file('cus_a', input());
    expect(claimView(c).canBookGarage).toBe(false);
    expect(claimView(c).progress).toEqual([
      { status: 'SUBMITTED', done: true, at: NOW.toISOString(), current: true },
      { status: 'UNDER_ASSESSMENT', done: false, current: false },
      { status: 'APPROVED', done: false, current: false },
      { status: 'REPAIR_BOOKED', done: false, current: false },
      { status: 'SETTLED', done: false, current: false },
    ]);
    expect(code(() => store.bookGarage(c.id, 'cus_a', 'g-sitra-auto-works'))).toBe('INVALID_TRANSITION');
    tick(60_000);
    expect(store.advance(c.id, 'cus_a').status).toBe('UNDER_ASSESSMENT');
    const approved = store.advance(c.id, 'cus_a');
    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedAmountFils).toBe(bhd(600));
    const view = claimView(approved);
    expect(view.canBookGarage).toBe(true);
    expect(view.nextStatuses).toEqual([]);
    expect(view.garageOptions.every((g) => !g.agency)).toBe(true);
    expect(code(() => store.advance(c.id, 'cus_a'))).toBe('INVALID_TRANSITION'); // book a garage first
    expect(code(() => store.advance(c.id, 'cus_a', 'REPAIR_BOOKED'))).toBe('INVALID_TRANSITION');
    expect(code(() => store.bookGarage(c.id, 'cus_a', 'g-agency-sitra'))).toBe('GARAGE_NOT_ALLOWED');
    expect(code(() => store.bookGarage(c.id, 'cus_a', 'g-nowhere'))).toBe('GARAGE_NOT_FOUND');
    expect(code(() => store.bookGarage(c.id, 'cus_a', undefined))).toBe('INVALID_REQUEST');
    const booked = store.bookGarage(c.id, 'cus_a', 'g-sitra-auto-works');
    expect(booked.status).toBe('REPAIR_BOOKED');
    expect(booked.garage?.name.en).toBe('Sitra Auto Works (demo)');
    expect(code(() => store.bookGarage(c.id, 'cus_a', 'g-tubli-body-paint'))).toBe('INVALID_TRANSITION');
    const settled = store.advance(c.id, 'cus_a');
    expect(settled.status).toBe('SETTLED');
    expect(settled.history.map((h) => h.status)).toEqual(['SUBMITTED', 'UNDER_ASSESSMENT', 'APPROVED', 'REPAIR_BOOKED', 'SETTLED']);
    expect(claimView(settled).progress.every((p) => p.done && p.at)).toBe(true);
    expect(code(() => store.advance(c.id, 'cus_a'))).toBe('INVALID_TRANSITION');
  });

  it('agency repair policies may book agency garages; rejection is final', () => {
    const { store } = setup();
    const c = store.file('cus_a', input({ policyId: 'pol_agency' }));
    store.advance(c.id, 'cus_a');
    expect(claimView(store.advance(c.id, 'cus_a')).garageOptions).toHaveLength(DEMO_GARAGES.length);
    expect(store.bookGarage(c.id, 'cus_a', 'g-agency-sitra').garage?.agency).toBe(true);

    const r = store.file('cus_a', input());
    store.advance(r.id, 'cus_a');
    expect(code(() => store.advance(r.id, 'cus_a', 'SETTLED'))).toBe('INVALID_TRANSITION');
    expect(code(() => store.advance(r.id, 'cus_a', 'NOPE'))).toBe('INVALID_REQUEST');
    const rejected = store.advance(r.id, 'cus_a', 'REJECTED');
    expect(rejected.approvedAmountFils).toBeUndefined();
    expect(claimView(rejected).progress.map((p) => [p.status, p.done])).toEqual([
      ['SUBMITTED', true],
      ['UNDER_ASSESSMENT', true],
      ['REJECTED', true],
    ]);
    expect(replacementCarOffer(rejected).offered).toBe(false);
    expect(code(() => store.advance(r.id, 'cus_a', 'APPROVED'))).toBe('INVALID_TRANSITION');
  });

  it('theft (total loss) goes from approved straight to settled, no garage', () => {
    const { store } = setup();
    const c = store.file('cus_a', input({ type: 'theft', photos: [], policeReportNumber: 'PR-778', thirdPartyInvolved: false }));
    store.advance(c.id, 'cus_a');
    const approved = store.advance(c.id, 'cus_a');
    expect(approved.approvedAmountFils).toBe(bhd(14_900));
    expect(claimView(approved).canBookGarage).toBe(false);
    expect(claimView(approved).nextStatuses).toEqual(['SETTLED']);
    expect(claimView(approved).progress.map((p) => p.status)).toEqual(['SUBMITTED', 'UNDER_ASSESSMENT', 'APPROVED', 'SETTLED']);
    expect(code(() => store.bookGarage(c.id, 'cus_a', 'g-sitra-auto-works'))).toBe('NO_REPAIR_NEEDED');
    expect(store.advance(c.id, 'cus_a').status).toBe('SETTLED');
  });

  it('lists newest first and caps claims per customer', () => {
    const { store, tick } = setup();
    const first = store.file('cus_a', input());
    tick(1000);
    const second = store.file('cus_a', input());
    expect(store.list('cus_a').map((c: Claim) => c.id)).toEqual([second.id, first.id]);
    for (let i = 2; i < 20; i++) store.file('cus_a', input());
    expect(code(() => store.file('cus_a', input()))).toBe('TOO_MANY_CLAIMS');
  });

  it('works with real policies from the policy store, and expired ones are refused', () => {
    let now = NOW;
    const policyStore = new SandboxPolicyStore(() => now);
    const q = policyStore.createQuote('cus_a', {
      line: 'motor',
      insurerId: 'pearl-takaful',
      input: { vehicleValueFils: bhd(14_900), cover: 'comprehensive', reference: '123456' },
    });
    const payment: Payment = {
      id: 'pay_1',
      amountFils: q.premiumFils,
      method: 'card',
      purpose: 'insurance_premium',
      reference: q.id,
      idempotencyKey: 'claims-test-1',
      status: 'CAPTURED',
      currency: 'BHD',
      createdAt: NOW.toISOString(),
      nextAction: 'none',
    };
    const policy = policyStore.confirm('cus_a', payment, q.id);
    const store = new SandboxClaimStore((c) => policyStore.list(c), () => now);
    const c = store.file('cus_a', input({ policyId: policy.id, incidentAt: '2026-10-03T13:00' }));
    expect(c.policyNumber).toBe(policy.policyNumber);
    expect(claimView(c).replacementCar).toMatchObject({ offered: true, days: 5, provider: { en: 'Tasheelat Car Leasing' } });
    now = new Date(Date.UTC(2027, 9, 5));
    expect(code(() => store.file('cus_a', input({ policyId: policy.id, incidentAt: '2027-10-05T01:00' })))).toBe('POLICY_NOT_ACTIVE');
  });
});

describe('config', () => {
  it('serves the claim form rules to the apps', () => {
    const cfg = clientConfig(demoCustomer(NOW).preApproval);
    expect(cfg.claims).toEqual(claimRules());
    expect(cfg.claims.types).toEqual(['collision', 'theft', 'glass', 'fire', 'other']);
    expect(cfg.claims.policeReportRequiredFor).toEqual(['theft']);
    expect(cfg.claims.minPhotos.theft).toBe(0);
    expect(garageOptions(false).some((g) => g.agency)).toBe(false);
  });
});
