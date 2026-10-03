import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_MAX_INPUT_CHARS,
  ASSISTANT_TOOLS,
  AssistantError,
  AssistantService,
  ConversationStore,
  RateLimiter,
  RulesBrain,
  VEHICLES,
  customerCardOffers,
  customerOverview,
  demoPolicyHistory,
  detectIntent,
  detectLanguage,
  formatBhd,
  newCustomerProfile,
  normalizeText,
  redactPii,
  runAssistantTool,
  searchVehicles,
  settlementQuote,
  withIdentity,
  withOnboarding,
  preApprove,
  bhd,
  type AssistantContext,
  type AssistantIntent,
  type AssistantReply,
  type AssistantToolName,
  type CustomerProfile,
  type IntentSlots,
  type Policy,
} from '../src';

const TODAY = new Date('2026-10-03T09:00:00Z');

function ctxFor(profile: CustomerProfile = newCustomerProfile('cus_test'), extra: Partial<AssistantContext> = {}): AssistantContext {
  const history: Policy = { ...demoPolicyHistory(profile.customerId), status: 'EXPIRED' };
  return {
    customer: customerOverview(profile, TODAY),
    policies: [history],
    cards: [],
    cardOffers: customerCardOffers(profile, TODAY),
    now: TODAY,
    ...extra,
  };
}

async function ask(text: string, opts: { locale?: 'en' | 'ar'; persona?: 'suhail' | 'suhaila'; service?: AssistantService; ctx?: AssistantContext; key?: string } = {}) {
  const service = opts.service ?? new AssistantService({ clock: () => TODAY });
  return service.handle(opts.key ?? 'cus_test', { text, locale: opts.locale ?? 'en', persona: opts.persona }, opts.ctx ?? ctxFor());
}

describe('Arabic normalization', () => {
  it('maps alef / ya / ta marbuta variants, removes tatweel and diacritics, converts Arabic-Indic digits', () => {
    expect(normalizeText('أإآٱ')).toBe('اااا');
    expect(normalizeText('مستشفى')).toBe('مستشفي');
    expect(normalizeText('السيّارة')).toBe('السياره');
    expect(normalizeText('متـــى')).toBe('متي');
    expect(normalizeText('٢٠٠ و ۳۵۰')).toBe('200 و 350');
    expect(normalizeText('BHD 1,500.500!')).toBe('bhd 1500.500');
    expect(normalizeText('CR-V')).toBe('cr-v');
  });

  it('answers in the language of the text, else the app locale', () => {
    expect(detectLanguage('كم باقي علي؟', 'en')).toBe('ar');
    expect(detectLanguage('How much do I owe?', 'ar')).toBe('en');
    expect(detectLanguage('٢٠٠', 'ar')).toBe('ar');
    expect(detectLanguage('200', 'en')).toBe('en');
  });
});

// [utterance, intent, expected slots]
const UTTERANCES: [string, AssistantIntent, IntentSlots?][] = [
  // English
  ['How much do I still owe on the car?', 'outstanding_balance', { contract: 'vehicle' }],
  ["what's my outstanding balance", 'outstanding_balance'],
  ['How much is left on my personal finance?', 'outstanding_balance', { contract: 'personal' }],
  ['When is my next installment?', 'next_installment'],
  ["when's my next payment due", 'next_installment'],
  ['Pay my installment', 'next_installment'],
  ['What if I pay it all off now?', 'settlement_quote'],
  ['I want to settle my car finance early', 'settlement_quote', { contract: 'vehicle' }],
  ['Suhaila, how much do I still owe on the car, and what if I pay it all off now?', 'settlement_quote', { contract: 'vehicle' }],
  ['Find me an SUV under BHD 200 a month', 'find_cars', { bodyType: 'suv', maxMonthlyFils: 200_000 }],
  ['show me used sedans', 'find_cars', { bodyType: 'sedan', condition: 'used' }],
  ['any electric cars?', 'find_cars', { fuel: 'electric' }],
  ['I need a pickup truck below 20000', 'find_cars', { bodyType: 'pickup', maxPriceFils: 20_000_000 }],
  ['cheapest Honda', 'find_cars', { make: 'Honda' }],
  ['a 2024 car under 150 per month', 'find_cars', { maxMonthlyFils: 150_000 }],
  ["What's my pre-approval?", 'pre_approval'],
  ['How much can I borrow?', 'pre_approval'],
  ['Is any insurance expiring soon?', 'policies', { expiringOnly: true }],
  ['renew my car insurance', 'policies'],
  ['What is my card status?', 'card_status'],
  ['I want to talk to an agent', 'handoff'],
  ['hello', 'greeting'],
  ['thanks!', 'thanks'],
  ['what can you do?', 'help'],
  ['yes', 'confirm'],
  ['what will the weather be tomorrow', 'unknown'],
  // Arabic: MSA and Bahraini / Gulf phrasings, with and without diacritics, Arabic-Indic digits
  ['كم باقي علي في السيارة', 'outstanding_balance', { contract: 'vehicle' }],
  ['كم باقي عليّ في السيّارة؟', 'outstanding_balance', { contract: 'vehicle' }],
  ['شكثر باقي علي؟', 'outstanding_balance'],
  ['جم باقي علي بالموتر', 'outstanding_balance', { contract: 'vehicle' }],
  ['المتبقي من التمويل الشخصي', 'outstanding_balance', { contract: 'personal' }],
  ['كم باقي على الـ CR-V', 'outstanding_balance', { contract: 'vehicle' }],
  ['متى القسط الجاي', 'next_installment'],
  ['متـــى القســط الجاي؟', 'next_installment'],
  ['موعد الدفعة القادمة', 'next_installment'],
  ['ابي ادفع القسط', 'next_installment'],
  ['أبي سيارة تحت 200 بالشهر', 'find_cars', { maxMonthlyFils: 200_000 }],
  ['أبي سيارة تحت ٢٠٠ بالشهر', 'find_cars', { maxMonthlyFils: 200_000 }],
  ['ابغى جيب مستعمل بحدود ٣٠٠ شهرياً', 'find_cars', { bodyType: 'suv', condition: 'used', maxMonthlyFils: 300_000 }],
  ['دور لي سيارة كهربائية', 'find_cars', { fuel: 'electric' }],
  ['ودي بسيارة سيدان جديدة', 'find_cars', { bodyType: 'sedan', condition: 'new' }],
  ['أبي أسدد الباقي كله على السيارة', 'settlement_quote', { contract: 'vehicle' }],
  ['كم السداد المبكر للسيارة؟', 'settlement_quote', { contract: 'vehicle' }],
  ['ابي اسكر القرض', 'settlement_quote'],
  ['كم الموافقة المسبقة حقي؟', 'pre_approval'],
  ['كم أقدر آخذ تمويل؟', 'pre_approval'],
  ['عندي تأمين بينتهي قريب؟', 'policies', { expiringOnly: true }],
  ['ابي اجدد تأمين السيارة', 'policies'],
  ['شنو وضع بطاقتي؟', 'card_status'],
  ['ابي اكلم موظف', 'handoff'],
  ['السلام عليكم', 'greeting'],
  ['مشكور', 'thanks'],
  ['ايه', 'confirm'],
  ['شو رأيك بالطقس', 'unknown'],
];

describe('intent detection (EN / AR utterance table)', () => {
  it('has at least 40 utterances, in both languages', () => {
    expect(UTTERANCES.length).toBeGreaterThanOrEqual(40);
    expect(UTTERANCES.filter(([u]) => /[؀-ۿ]/.test(u)).length).toBeGreaterThanOrEqual(20);
  });

  it.each(UTTERANCES)('%s → %s', (text, intent, slots) => {
    const d = detectIntent(text);
    expect(d.intent).toBe(intent);
    if (slots) expect(d.slots).toMatchObject(slots);
  });
});

describe('tools for the demo customer', () => {
  const ctx = ctxFor();
  const car = ctx.customer.contracts.find((c) => c.id === 'c-1001')!;
  const personal = ctx.customer.contracts.find((c) => c.id === 'c-1002')!;

  it('registry: read-only tools only, each runnable', () => {
    for (const t of ASSISTANT_TOOLS) {
      expect(t.name).toMatch(/^(get|search|list|request)_/);
      expect(() => runAssistantTool(ctx, t.name as AssistantToolName)).not.toThrow();
    }
  });

  it('outstanding balance of the car equals the contract (as on My installments)', async () => {
    const r = await ask('How much do I still owe on the car?');
    expect(r.intent).toBe('outstanding_balance');
    expect(r.text).toContain(formatBhd(car.outstandingFils, 'en'));
    expect(r.cards[0]).toMatchObject({ kind: 'amounts', rows: [{ amountFils: car.outstandingFils }] });
    expect(r.actions.map((a) => a.href)).toEqual(['/account']);
    expect(r.contractIds).toEqual(['c-1001']);
  });

  it('answers Arabic in Arabic, even when the app is in English', async () => {
    const r = await ask('كم باقي علي في السيارة', { locale: 'en' });
    expect(r.locale).toBe('ar');
    expect(r.text).toContain(formatBhd(car.outstandingFils, 'ar'));
    expect(r.text).toContain('هوندا');
  });

  it('next installment: soonest first; a payment link only for contracts without autopay', async () => {
    const r = await ask('When is my next installment?');
    expect(r.intent).toBe('next_installment');
    const due = [car, personal].sort((a, b) => a.nextInstallment!.dueDate.localeCompare(b.nextInstallment!.dueDate));
    expect(r.text.indexOf(due[0]!.title.en)).toBeLessThan(r.text.indexOf(due[1]!.title.en));
    const pays = r.actions.filter((a) => a.kind === 'payment');
    expect(pays).toHaveLength(1); // the car has autopay on
    expect(pays[0]!.requiresConfirmation).toBe(true);
    expect(pays[0]!.href).toBe(
      `/checkout?purpose=installment&amount=${personal.nextInstallment!.amountFils}&reference=c-1002-${personal.nextInstallment!.number}&label=${encodeURIComponent('Personal Finance')}`,
    );
  });

  it('J8: owe + pay it all off → the settlement quote of the car, proposed (never executed)', async () => {
    const q = settlementQuote(car, TODAY);
    const r = await ask('Suhaila, how much do I still owe on the car, and what if I pay it all off now?');
    expect(r.intent).toBe('settlement_quote');
    expect(r.text).toContain(formatBhd(q.remainingScheduledFils, 'en'));
    expect(r.text).toContain(formatBhd(q.settlementAmountFils, 'en'));
    expect(r.text).toContain(formatBhd(q.savingsFils, 'en'));
    expect(r.text).toContain("can't pay for you");
    const pay = r.actions.find((a) => a.kind === 'payment')!;
    expect(pay.href).toContain(`purpose=early_settlement&amount=${q.settlementAmountFils}&reference=c-1001-settle`);
    expect(pay.requiresConfirmation).toBe(true);
    const card = r.cards[0]!;
    expect(card.kind === 'amounts' && card.rows.find((x) => x.emphasis)?.amountFils).toBe(q.settlementAmountFils);
  });

  it('follow-up "and if I pay it all off now?" uses the contract of the previous answer; "yes" does not pay', async () => {
    const service = new AssistantService({ clock: () => TODAY });
    await ask('كم باقي علي في السيارة', { service, locale: 'ar' });
    const r = await ask('وكم لو أسدد الباقي كله مره وحده؟', { service, locale: 'ar' });
    expect(r.intent).toBe('settlement_quote');
    expect(r.contractIds).toEqual(['c-1001']);
    expect(r.cards).toHaveLength(1);
    const yes = await ask('ايه', { service, locale: 'ar' });
    expect(yes.intent).toBe('confirm');
    expect(yes.actions.map((a) => a.href)).toEqual([r.actions[0]!.href]);
    expect(yes.text).toContain('ما أقدر أدفع');
  });

  it('cars by monthly budget and body type come from searchVehicles', async () => {
    const r = await ask('أبي سيارة جيب تحت ٢٠٠ بالشهر', { locale: 'ar' });
    const expected = searchVehicles(VEHICLES, { bodyType: 'suv', maxMonthlyFils: 200_000 });
    const card = r.cards[0]!;
    expect(card.kind).toBe('vehicles');
    if (card.kind !== 'vehicles') return;
    expect(card.items.map((v) => v.id)).toEqual(expected.slice(0, 4).map((v) => v.id));
    for (const v of card.items) {
      expect(v.fromMonthlyFils).toBeLessThanOrEqual(200_000);
      expect(v.href).toBe(`/cars/${v.id}`);
    }
    expect(r.actions.at(-1)!.href).toBe('/cars?bodyType=suv&maxMonthlyFils=200000');
  });

  it('no car matches: polite answer, no vehicle card', async () => {
    const r = await ask('find me a coupe under 20 a month');
    expect(r.intent).toBe('find_cars');
    expect(r.cards).toEqual([]);
    expect(r.text).toContain("couldn't find");
  });

  it('pre-approval figures equal the customer pre-approval', async () => {
    const r = await ask("What's my pre-approval?");
    const pa = ctx.customer.preApproval;
    const card = r.cards[0]!;
    expect(card.kind === 'amounts' && card.rows.map((x) => x.amountFils)).toEqual([pa.maxMonthlyFils, ...pa.limits.map((x) => x.maxFinanceFils), pa.cardLimitFils]);
    expect(r.actions[0]!.href).toBe(`/cars?maxMonthlyFils=${pa.maxMonthlyFils}`);
    expect(r.actions.map((a) => a.href)).toContain('/onboarding');
  });

  it('policies: the CR-V motor cover from My Garage expires soon; expired history is not active', async () => {
    const r = await ask('Is any insurance expiring soon?');
    expect(r.text).toContain('You have no active insurance policies');
    expect(r.text).toContain('Honda CR-V 2026');
    expect(r.text).toContain('in 24 days');
    expect(r.actions[0]!.href).toBe('/insurance');
  });

  it('cards: none yet → the best eligible card; with a card → its masked status', async () => {
    const none = await ask('card status');
    expect(none.actions[0]!.href).toMatch(/^\/cards\/imtiaz-[a-z-]+\/apply$/);
    const withCard = ctxFor(undefined, {
      cards: [
        {
          id: 'vc_1', cardId: 'imtiaz-world', name: { en: 'IMTIAZ World Mastercard', ar: 'بطاقة امتياز ورلد ماستركارد' }, network: 'mastercard',
          panMasked: '5xxx xxxx xxxx 4242', last4: '4242', expiry: '10/29', status: 'ACTIVE', limitFils: bhd(2_800), issuedAt: TODAY.toISOString(),
          gradient: ['#000', '#fff'], wallet: { applePay: true, googlePay: true, samsungPay: true, sandbox: true },
        },
      ],
    });
    const r = await ask('بطاقتي', { ctx: withCard, locale: 'ar' });
    expect(r.text).toContain('4242');
    expect(r.text).toContain(formatBhd(bhd(2_800), 'ar'));
  });

  it('handoff returns a sandbox reference; unknown text gets suggestions', async () => {
    const h = await ask('I want to talk to an agent');
    expect(h.handoff).toMatchObject({ sandbox: true });
    expect(h.handoff!.reference).toMatch(/^HO-SBX-[0-9A-Z]{5}$/);
    expect(h.text).toContain(h.handoff!.reference);
    const u = await ask('what will the weather be tomorrow');
    expect(u.intent).toBe('unknown');
    expect(u.suggestions.length).toBeGreaterThanOrEqual(4);
  });

  it('persona changes only the name and greeting', async () => {
    const m = await ask('hello', { persona: 'suhail' });
    const f = await ask('hello', { persona: 'suhaila' });
    expect(m.personaName).toBe('Suhail');
    expect(f.personaName).toBe('Suhaila');
    expect(m.text).toContain("I'm Suhail,");
    expect(f.text).toContain("I'm Suhaila,");
    const arM = await ask('مرحبا', { persona: 'suhail' });
    const arF = await ask('مرحبا', { persona: 'suhaila' });
    expect(arM.text).toContain('أنا سهيل، مساعدك');
    expect(arF.text).toContain('أنا سهيلة، مساعدتك');
    const a = await ask('When is my next installment?', { persona: 'suhail' });
    const b = await ask('When is my next installment?', { persona: 'suhaila' });
    expect(a.text).toBe(b.text);
  });
});

describe('privacy: no raw PII in replies or memory', () => {
  it('never shows the CPR or the salary, even when asked, and redacts what the customer typed', async () => {
    const salary = 1_234_567;
    const financials = { monthlySalaryFils: salary, existingObligationsFils: 100_000 };
    let profile = withIdentity(newCustomerProfile('cus_pii'), { cpr: '880412345', cprMasked: 'xxxxx2345', name: { en: 'Test Person', ar: 'شخص' }, nationality: 'BH', dateOfBirth: '1988-04-12' } as never);
    profile = withOnboarding(profile, financials, { preApproval: preApprove(financials, TODAY) } as never, TODAY);
    const ctx = ctxFor(profile);
    const service = new AssistantService({ clock: () => TODAY });
    const replies: AssistantReply[] = [];
    for (const text of ["what's my salary?", 'my CPR is 880412345, what is my pre-approval?', 'رقمي الشخصي ٨٨٠٤١٢٣٤٥ كم باقي علي', 'hello', 'card status', 'when is my next installment']) {
      replies.push(await service.handle('cus_pii', { text, locale: 'en' }, ctx));
    }
    const json = JSON.stringify(replies) + JSON.stringify(service.conversations.history('cus_pii'));
    for (const secret of ['880412345', '٨٨٠٤١٢٣٤٥', 'xxxxx2345', String(salary), formatBhd(salary, 'en'), formatBhd(salary, 'ar'), '1,234.567']) {
      expect(json).not.toContain(secret);
    }
    expect(service.conversations.history('cus_pii').some((t) => t.text.includes('[•••]'))).toBe(true);
  });

  it('redactPii keeps amounts and dates readable', () => {
    expect(redactPii('BHD 4,320.000 due 2026-10-07, ref c-1001-settle')).toBe('BHD 4,320.000 due 2026-10-07, ref c-1001-settle');
    expect(redactPii('card 5123 4567 8901 2345 and mail a.b@x.bh')).toBe('card [•••] and mail [•••]');
    expect(redactPii('CPR ٨٨٠٤١٢٣٤٥ ok')).toBe('CPR [•••] ok');
  });
});

describe('limits: input cap, validation, rate limit, memory', () => {
  it('rejects empty, too long, bad locale or persona', async () => {
    const service = new AssistantService();
    const ctx = ctxFor();
    const code = async (body: object) => {
      try {
        await service.handle(`k${Math.random()}`, body, ctx);
        return 'OK';
      } catch (e) {
        return (e as AssistantError).code;
      }
    };
    expect(await code({ text: '  ', locale: 'en' })).toBe('TEXT_REQUIRED');
    expect(await code({ text: 'x'.repeat(ASSISTANT_MAX_INPUT_CHARS + 1), locale: 'en' })).toBe('TEXT_TOO_LONG');
    expect(await code({ text: 'x'.repeat(ASSISTANT_MAX_INPUT_CHARS), locale: 'en' })).toBe('OK');
    expect(await code({ text: 'hi', locale: 'fr' })).toBe('INVALID_REQUEST');
    expect(await code({ text: 'hi', locale: 'en', persona: 'bob' })).toBe('INVALID_REQUEST');
  });

  it('allows 20 messages a minute per session, then RATE_LIMITED with a retry delay; other sessions are not affected', async () => {
    let now = 0;
    const service = new AssistantService({ limiter: new RateLimiter(20, 60_000, () => now), brain: new RulesBrain() });
    const ctx = ctxFor();
    for (let i = 0; i < 20; i++) {
      now += 1000;
      await service.handle('a', { text: 'hi', locale: 'en' }, ctx);
    }
    const err = await service.handle('a', { text: 'hi', locale: 'en' }, ctx).catch((e: AssistantError) => e);
    expect(err).toBeInstanceOf(AssistantError);
    expect((err as AssistantError).code).toBe('RATE_LIMITED');
    expect((err as AssistantError).retryAfterSec).toBe(41);
    await expect(service.handle('b', { text: 'hi', locale: 'en' }, ctx)).resolves.toBeDefined();
    now += 41_000;
    await expect(service.handle('a', { text: 'hi', locale: 'en' }, ctx)).resolves.toBeDefined();
  });

  it('keeps only the last N turns per conversation', () => {
    const store = new ConversationStore(4);
    for (let i = 0; i < 5; i++) store.append('k', { role: 'user', text: `m${i}`, at: '' }, { role: 'assistant', text: `r${i}`, at: '' });
    expect(store.history('k').map((t) => t.text)).toEqual(['m3', 'r3', 'm4', 'r4']);
    expect(store.history('other')).toEqual([]);
  });
});
