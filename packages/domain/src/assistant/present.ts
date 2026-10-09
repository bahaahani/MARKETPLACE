import { formatBhd, type Fils, type Locale } from '../money';
import { LISTING_DEFAULTS } from '../rates';
import type { SettlementLineKind } from '../settlement';
import type { BodyType, FuelType, Localized, VehicleCondition } from '../types';
import type { InsuranceLine } from '../insurance-common';
import type { AssistantIntent } from './intents';
import type { AssistantToolResult } from './tools';
import { PERSONA_NAME, type AssistantAction, type AssistantCard, type AssistantPersona } from './types';

/**
 * Turns tool results into what the apps show: text in the customer's language, cards (figures, cars, lists) and
 * suggested actions (links to the normal screens). Deterministic, so the same figures appear in the chat, on the
 * account page and in the checkout.
 *
 * ⚠️ An LLM brain would still call presentToolResult() for cards and actions and only replace `text`.
 */

export interface Presentation {
  text: string;
  cards: AssistantCard[];
  actions: AssistantAction[];
  suggestions: string[];
}

type L = Locale;
const pick = (l: L, en: string, ar: string) => (l === 'en' ? en : ar);
const money = (fils: Fils, l: L) => formatBhd(fils, l);

export function formatAssistantDate(iso: string, l: L): string {
  return new Intl.DateTimeFormat(l === 'ar' ? 'ar-BH-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${iso.slice(0, 10)}T00:00:00Z`),
  );
}
const date = formatAssistantDate;

function checkoutHref(purpose: string, amountFils: Fils, reference: string, label: string): string {
  return `/checkout?purpose=${purpose}&amount=${amountFils}&reference=${encodeURIComponent(reference)}&label=${encodeURIComponent(label)}`;
}

function navigate(id: string, label: string, href: string): AssistantAction {
  return { id, label, href, kind: 'navigate', requiresConfirmation: false };
}

function payment(id: string, label: string, href: string): AssistantAction {
  return { id, label, href, kind: 'payment', requiresConfirmation: true };
}

const SUGGEST: Record<'balance' | 'next' | 'settle' | 'cars' | 'pre' | 'policies' | 'cards' | 'agent', Localized> = {
  balance: { en: 'How much do I still owe on the car?', ar: 'كم باقي علي في السيارة؟' },
  next: { en: 'When is my next installment?', ar: 'متى القسط الجاي؟' },
  settle: { en: 'What if I pay it all off now?', ar: 'كم لو أسدد الباقي كله الحين؟' },
  cars: { en: 'Find me an SUV under BHD 200 a month', ar: 'أبي سيارة جيب تحت 200 بالشهر' },
  pre: { en: "What's my pre-approval?", ar: 'كم الموافقة المسبقة حقي؟' },
  policies: { en: 'Is any insurance expiring soon?', ar: 'هل في تأمين بينتهي قريب؟' },
  cards: { en: 'What is my card status?', ar: 'شنو وضع بطاقتي؟' },
  agent: { en: 'Talk to an agent', ar: 'أبي أكلم موظف' },
};
const suggest = (l: L, ...keys: (keyof typeof SUGGEST)[]) => keys.map((k) => SUGGEST[k][l]);

/** Starter prompts for the chat (also shown with the greeting and the fallback). */
export function starterSuggestions(l: L): string[] {
  return suggest(l, 'balance', 'next', 'cars', 'policies');
}

const LINE_LABEL: Record<SettlementLineKind, Localized> = {
  remaining_principal: { en: 'Remaining principal', ar: 'أصل المبلغ المتبقي' },
  settlement_fee: { en: 'Early settlement fee ⚠️', ar: 'رسوم السداد المبكر ⚠️' },
  remaining_sale_price: { en: 'Remaining sale price', ar: 'المتبقي من ثمن البيع' },
  ibra_rebate: { en: "Ibra' rebate ⚠️", ar: 'خصم الإبراء ⚠️' },
  remaining_asset_cost: { en: 'Remaining asset cost', ar: 'التكلفة المتبقية للأصل' },
};

const BODY_LABEL: Record<BodyType, Localized> = {
  suv: { en: 'SUVs', ar: 'سيارات SUV' },
  sedan: { en: 'sedans', ar: 'سيارات سيدان' },
  hatchback: { en: 'hatchbacks', ar: 'سيارات هاتشباك' },
  pickup: { en: 'pickups', ar: 'سيارات بيك أب' },
  coupe: { en: 'coupes', ar: 'سيارات كوبيه' },
};
const FUEL_LABEL: Record<FuelType, Localized> = {
  petrol: { en: 'petrol', ar: 'بنزين' },
  hybrid: { en: 'hybrid', ar: 'هايبرد' },
  electric: { en: 'electric', ar: 'كهربائية' },
};
const CONDITION_LABEL: Record<VehicleCondition, Localized> = { new: { en: 'new', ar: 'جديدة' }, used: { en: 'used', ar: 'مستعملة' } };
const INS_LINE: Record<InsuranceLine, Localized> = {
  motor: { en: 'Motor', ar: 'تأمين السيارة' },
  travel: { en: 'Travel', ar: 'تأمين السفر' },
  home: { en: 'Home', ar: 'تأمين المنزل' },
  medical: { en: 'Medical', ar: 'التأمين الطبي' },
  life: { en: 'Life', ar: 'التأمين على الحياة' },
};
const CARD_STATUS: Record<string, Localized> = {
  ACTIVE: { en: 'active', ar: 'فعّالة' },
  FROZEN: { en: 'frozen', ar: 'مجمّدة' },
  CLOSED: { en: 'closed', ar: 'مغلقة' },
};
const PRODUCT_LINE: Record<string, Localized> = {
  vehicle: { en: 'Car finance', ar: 'تمويل السيارات' },
  personal: { en: 'Personal finance', ar: 'التمويل الشخصي' },
  home: { en: 'Home finance', ar: 'التمويل العقاري' },
};

const NO_PAY_NOTE: Localized = {
  en: "I can't pay for you: the button opens the checkout, where you review and confirm.",
  ar: 'لا أستطيع الدفع نيابةً عنك: الزر يفتح صفحة الدفع لتراجع المبلغ وتؤكده بنفسك.',
};

export function presentToolResult(r: AssistantToolResult, l: L): Presentation {
  switch (r.tool) {
    case 'get_outstanding_balance': {
      const open = r.contracts.filter((c) => !c.settledOn);
      const settled = r.contracts.filter((c) => c.settledOn);
      const parts: string[] = [];
      if (open.length === 1) {
        const c = open[0]!;
        parts.push(
          pick(
            l,
            `You still owe ${money(c.outstandingFils, l)} on ${c.title.en} (${c.installmentsPaid} of ${c.installmentsTotal} installments paid).`,
            `المتبقي عليك ${money(c.outstandingFils, l)} في ${c.title.ar} (تم سداد ${c.installmentsPaid} من ${c.installmentsTotal} قسطاً).`,
          ),
        );
      } else if (open.length > 1) {
        parts.push(pick(l, `You still owe ${money(r.totalOutstandingFils, l)} in total:`, `المتبقي عليك ${money(r.totalOutstandingFils, l)} إجمالاً:`));
      } else if (settled.length === 0) {
        parts.push(pick(l, 'You have no finance contracts with us.', 'لا توجد لديك عقود تمويل معنا.'));
      }
      for (const c of settled) {
        parts.push(pick(l, `${c.title.en} was settled on ${date(c.settledOn!, l)}; nothing is outstanding.`, `تمت تسوية ${c.title.ar} في ${date(c.settledOn!, l)}، ولا يوجد مبلغ متبقٍّ.`));
      }
      const cards: AssistantCard[] =
        open.length > 0
          ? [
              {
                kind: 'amounts',
                title: pick(l, 'Outstanding balance', 'المبلغ المتبقي'),
                rows: [
                  ...open.map((c) => ({ label: c.title[l], amountFils: c.outstandingFils })),
                  ...(open.length > 1 ? [{ label: pick(l, 'Total', 'الإجمالي'), amountFils: r.totalOutstandingFils, emphasis: true }] : []),
                ],
              },
            ]
          : [];
      return {
        text: parts.join(' '),
        cards,
        actions: [navigate('account', pick(l, 'View my installments', 'عرض أقساطي'), '/account')],
        suggestions: suggest(l, 'settle', 'next'),
      };
    }

    case 'get_next_installment': {
      if (r.items.length === 0) {
        return {
          text: pick(l, 'You have no installments due.', 'لا توجد عليك أقساط مستحقة.'),
          cards: [],
          actions: [navigate('account', pick(l, 'View my installments', 'عرض أقساطي'), '/account')],
          suggestions: suggest(l, 'cars', 'pre'),
        };
      }
      const [first, ...rest] = r.items as [(typeof r.items)[number], ...typeof r.items];
      const autopayNote = (on: boolean) =>
        on ? pick(l, ' Autopay is on, so it will be collected automatically.', ' الدفع التلقائي مفعّل، وسيُحصَّل القسط تلقائياً.') : '';
      const overdue = first.status === 'overdue';
      let text = pick(
        l,
        `Your next installment is ${money(first.amountFils, l)} for ${first.title.en}, ${overdue ? 'overdue since' : 'due on'} ${date(first.dueDate, l)}.`,
        `قسطك القادم ${money(first.amountFils, l)} لـ${first.title.ar}، ${overdue ? 'متأخر منذ' : 'مستحق في'} ${date(first.dueDate, l)}.`,
      );
      text += autopayNote(first.autopay);
      for (const i of rest) {
        text += pick(
          l,
          ` Then ${money(i.amountFils, l)} for ${i.title.en} on ${date(i.dueDate, l)}.${autopayNote(i.autopay)}`,
          ` ثم ${money(i.amountFils, l)} لـ${i.title.ar} في ${date(i.dueDate, l)}.${autopayNote(i.autopay)}`,
        );
      }
      const toPay = r.items.filter((i) => !i.autopay);
      if (toPay.length) text += ` ${NO_PAY_NOTE[l]}`;
      return {
        text,
        cards: [
          {
            kind: 'list',
            title: pick(l, 'Upcoming installments', 'الأقساط القادمة'),
            items: r.items.map((i) => ({
              title: i.title[l],
              detail: `${money(i.amountFils, l)} · ${date(i.dueDate, l)}${i.autopay ? pick(l, ' · Autopay', ' · دفع تلقائي') : ''}`,
            })),
          },
        ],
        actions: [
          ...toPay.map((i) =>
            payment(
              `pay-${i.contractId}`,
              pick(l, `Pay ${money(i.amountFils, l)} now`, `ادفع ${money(i.amountFils, l)} الآن`),
              checkoutHref('installment', i.amountFils, `${i.contractId}-${i.number}`, i.title[l]),
            ),
          ),
          navigate('account', pick(l, 'View my installments', 'عرض أقساطي'), '/account'),
        ],
        suggestions: suggest(l, 'balance', 'settle'),
      };
    }

    case 'get_settlement_quote': {
      const parts: string[] = [];
      const cards: AssistantCard[] = [];
      const actions: AssistantAction[] = [];
      for (const item of r.items) {
        const q = item.quote;
        if (!q) {
          parts.push(
            item.unavailable === 'ALREADY_SETTLED'
              ? pick(l, `${item.title.en} is already settled.`, `تمت تسوية ${item.title.ar} مسبقاً.`)
              : pick(l, `${item.title.en} is fully paid.`, `تم سداد ${item.title.ar} بالكامل.`),
          );
          continue;
        }
        parts.push(
          pick(
            l,
            `On ${item.title.en}, ${money(q.remainingScheduledFils, l)} remains to term. Settling early today would be ${money(q.settlementAmountFils, l)}, saving you ${money(q.savingsFils, l)} (quote valid until ${date(q.validUntil, l)}).`,
            `في ${item.title.ar}، المتبقي حتى نهاية العقد ${money(q.remainingScheduledFils, l)}. السداد المبكر اليوم ${money(q.settlementAmountFils, l)}، وتوفّر ${money(q.savingsFils, l)} (العرض صالح حتى ${date(q.validUntil, l)}).`,
          ),
        );
        cards.push({
          kind: 'amounts',
          title: pick(l, `Early settlement: ${item.title.en}`, `سداد مبكر: ${item.title.ar}`),
          rows: [
            { label: pick(l, 'Remaining to term', 'المتبقي حتى نهاية العقد'), amountFils: q.remainingScheduledFils },
            ...q.lines.map((x) => ({ label: LINE_LABEL[x.kind][l], amountFils: x.amountFils })),
            { label: pick(l, 'Pay today', 'المبلغ المطلوب اليوم'), amountFils: q.settlementAmountFils, emphasis: true },
            { label: pick(l, 'You save', 'توفيرك'), amountFils: q.savingsFils },
          ],
          note:
            q.structure === 'murabaha'
              ? pick(l, "Ibra' is at BCFC's discretion and pending the Shari'a Supervisory Board (placeholder rule).", 'الإبراء تقديري من الشركة وبانتظار اعتماد هيئة الرقابة الشرعية (قاعدة مؤقتة).')
              : q.structure === 'ijara'
                ? pick(l, "Ijara buy-out at the remaining asset cost (placeholder rule pending the Shari'a Supervisory Board).", 'شراء الأصل في الإجارة بالتكلفة المتبقية (قاعدة مؤقتة بانتظار اعتماد هيئة الرقابة الشرعية).')
                : pick(l, 'Placeholder fee pending CBB rules.', 'رسوم مؤقتة بانتظار قواعد مصرف البحرين المركزي.'),
        });
        actions.push(
          payment(
            `settle-${item.contractId}`,
            pick(l, `Settle for ${money(q.settlementAmountFils, l)}`, `سدّد ${money(q.settlementAmountFils, l)}`),
            checkoutHref(q.payment.purpose, q.payment.amountFils, q.payment.reference, pick(l, `Early settlement: ${item.title.en}`, `سداد مبكر: ${item.title.ar}`)),
          ),
        );
      }
      if (actions.length) parts.push(NO_PAY_NOTE[l]);
      if (r.items.length === 0) parts.push(pick(l, 'You have no finance contracts with us.', 'لا توجد لديك عقود تمويل معنا.'));
      return { text: parts.join(' '), cards, actions: [...actions, navigate('account', pick(l, 'View my installments', 'عرض أقساطي'), '/account')], suggestions: suggest(l, 'next', 'agent') };
    }

    case 'search_vehicles': {
      const f = r.filters;
      const desc: string[] = [];
      if (f.condition) desc.push(CONDITION_LABEL[f.condition][l]);
      if (f.fuel) desc.push(FUEL_LABEL[f.fuel][l]);
      if (f.make) desc.push(f.make);
      if (f.bodyType) desc.push(BODY_LABEL[f.bodyType][l]);
      if (f.maxMonthlyFils) desc.push(pick(l, `up to ${money(f.maxMonthlyFils, l)} a month`, `حتى ${money(f.maxMonthlyFils, l)} بالشهر`));
      if (f.maxPriceFils) desc.push(pick(l, `priced up to ${money(f.maxPriceFils, l)}`, `بسعر حتى ${money(f.maxPriceFils, l)}`));
      const d = desc.length ? pick(l, ` (${desc.join(', ')})`, ` (${desc.join('، ')})`) : '';
      const terms = LISTING_DEFAULTS.vehicle;
      const query = Object.entries({ q: f.make, condition: f.condition, bodyType: f.bodyType, maxMonthlyFils: f.maxMonthlyFils })
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
        .join('&');
      const all = navigate('cars', pick(l, 'See all matching cars', 'عرض كل السيارات المطابقة'), `/cars${query ? `?${query}` : ''}`);
      if (r.items.length === 0) {
        return {
          text: pick(l, `I couldn't find a car${d}. Try a higher budget or another body type.`, `لم أجد سيارة${d}. جرّب ميزانية أعلى أو نوعاً آخر.`),
          cards: [],
          actions: [navigate('cars', pick(l, 'Browse all cars', 'تصفّح كل السيارات'), '/cars')],
          suggestions: suggest(l, 'pre', 'cars'),
        };
      }
      return {
        text: pick(
          l,
          `Here ${r.total === 1 ? 'is 1 car' : `are ${r.items.length} of ${r.total} cars`}${d}, cheapest first. Monthly prices assume ${terms.downPaymentPct}% down over ${terms.tenureMonths} months.`,
          `إليك ${r.total === 1 ? 'سيارة واحدة' : `${r.items.length} من ${r.total} سيارات`}${d}، الأرخص أولاً. القسط الشهري بدفعة أولى ${terms.downPaymentPct}% على ${terms.tenureMonths} شهراً.`,
        ),
        cards: [
          {
            kind: 'vehicles',
            title: pick(l, 'Cars for you', 'سيارات تناسبك'),
            items: r.items.map((v) => ({
              id: v.id,
              title: `${v.make} ${v.model} ${v.trim}`,
              year: v.year,
              condition: v.condition,
              bodyType: v.bodyType,
              priceFils: v.priceFils,
              fromMonthlyFils: v.fromMonthlyFils,
              href: `/cars/${v.id}`,
            })),
          },
        ],
        actions: [...r.items.slice(0, 1).map((v) => navigate(`car-${v.id}`, pick(l, `View ${v.make} ${v.model}`, `عرض ${v.make} ${v.model}`), `/cars/${v.id}`)), all],
        suggestions: suggest(l, 'pre', 'balance'),
      };
    }

    case 'get_pre_approval': {
      const pa = r.preApproval;
      const limit = (line: string) => pa.limits.find((x) => x.productLine === line)?.maxFinanceFils ?? 0;
      const text =
        pa.maxMonthlyFils <= 0
          ? pick(l, 'Right now you have no room for a new monthly installment under the debt-burden limit.', 'حالياً لا يوجد هامش لقسط شهري جديد ضمن حد عبء الدين.')
          : pick(
              l,
              `You're pre-approved for new installments of up to ${money(pa.maxMonthlyFils, l)} a month: car finance up to ${money(limit('vehicle'), l)}, personal finance up to ${money(limit('personal'), l)}, home finance up to ${money(limit('home'), l)}, and a card limit of ${money(pa.cardLimitFils, l)}. Valid until ${date(pa.validUntil, l)}. Indicative only, not a credit decision.`,
              `لديك موافقة مسبقة لأقساط جديدة حتى ${money(pa.maxMonthlyFils, l)} شهرياً: تمويل سيارات حتى ${money(limit('vehicle'), l)}، وتمويل شخصي حتى ${money(limit('personal'), l)}، وتمويل عقاري حتى ${money(limit('home'), l)}، وحد بطاقة ${money(pa.cardLimitFils, l)}، والموافقة صالحة حتى ${date(pa.validUntil, l)}. أرقام استرشادية وليست قراراً ائتمانياً.`,
            ) +
            (r.onboarded ? '' : pick(l, ' These are the demo profile’s figures: complete onboarding for your own.', ' هذه أرقام الملف التجريبي: أكمل التسجيل لتحصل على أرقامك.'));
      return {
        text,
        cards: [
          {
            kind: 'amounts',
            title: pick(l, 'Your pre-approval', 'موافقتك المسبقة'),
            rows: [
              { label: pick(l, 'Monthly headroom', 'الهامش الشهري'), amountFils: pa.maxMonthlyFils, emphasis: true },
              ...pa.limits.map((x) => ({ label: PRODUCT_LINE[x.productLine]![l], amountFils: x.maxFinanceFils })),
              { label: pick(l, 'Card limit', 'حد البطاقة'), amountFils: pa.cardLimitFils },
            ],
          },
        ],
        actions: [
          ...(pa.maxMonthlyFils > 0 ? [navigate('cars-budget', pick(l, 'Cars within my budget', 'سيارات ضمن ميزانيتي'), `/cars?maxMonthlyFils=${pa.maxMonthlyFils}`)] : []),
          navigate('personal-finance', pick(l, 'Personal finance', 'التمويل الشخصي'), '/finance/personal'),
          ...(r.onboarded ? [] : [navigate('onboarding', pick(l, 'Get my own pre-approval', 'احصل على موافقتك المسبقة'), '/onboarding')]),
        ],
        suggestions: suggest(l, 'cars', 'cards'),
      };
    }

    case 'list_policies': {
      const parts: string[] = [];
      if (r.active.length === 0) parts.push(pick(l, 'You have no active insurance policies with us.', 'لا توجد لديك وثائق تأمين سارية معنا.'));
      else parts.push(pick(l, `You have ${r.active.length} active ${r.active.length === 1 ? 'policy' : 'policies'}.`, `لديك ${r.active.length} من وثائق التأمين السارية.`));
      for (const p of r.expiringSoon) {
        parts.push(
          pick(
            l,
            `${INS_LINE[p.line].en} cover with ${p.insurerName.en} ends on ${date(p.endDate, l)} (in ${p.daysLeft} days).`,
            `${INS_LINE[p.line].ar} لدى ${p.insurerName.ar} ينتهي في ${date(p.endDate, l)} (بعد ${p.daysLeft} يوماً).`,
          ),
        );
      }
      for (const g of r.garage) {
        parts.push(
          pick(
            l,
            `The motor insurance on your ${g.vehicleTitle} expires on ${date(g.insuranceExpiry, l)}, in ${g.daysLeft} days.`,
            `تأمين سيارتك ${g.vehicleTitle} ينتهي في ${date(g.insuranceExpiry, l)}، بعد ${g.daysLeft} يوماً.`,
          ),
        );
      }
      if (r.expiringSoon.length === 0 && r.garage.length === 0) {
        parts.push(pick(l, `Nothing expires in the next ${r.withinDays} days.`, `لا شيء ينتهي خلال ${r.withinDays} يوماً القادمة.`));
      }
      const items = [
        ...r.active.map((p) => ({ title: `${INS_LINE[p.line][l]} · ${p.insurerName[l]}${p.takaful ? pick(l, ' (Takaful)', ' (تكافل)') : ''}`, detail: pick(l, `Until ${date(p.endDate, l)}`, `حتى ${date(p.endDate, l)}`) })),
        ...r.garage.map((g) => ({ title: `${INS_LINE.motor[l]} · ${g.vehicleTitle}`, detail: pick(l, `Expires ${date(g.insuranceExpiry, l)}`, `ينتهي ${date(g.insuranceExpiry, l)}`) })),
      ];
      return {
        text: parts.join(' '),
        cards: items.length ? [{ kind: 'list', title: pick(l, 'Your insurance', 'تأميناتك'), items }] : [],
        actions: [
          navigate('insurance', r.garage.length ? pick(l, 'Compare motor renewal quotes', 'قارن عروض تجديد تأمين السيارة') : pick(l, 'Compare insurance', 'قارن عروض التأمين'), '/insurance'),
          navigate('account', pick(l, 'View my policies', 'عرض وثائقي'), '/account'),
        ],
        suggestions: suggest(l, 'cards', 'next'),
      };
    }

    case 'get_card_status': {
      if (r.cards.length > 0) {
        const lines = r.cards.map((c) =>
          pick(
            l,
            `${c.name.en} ending ${c.last4}: ${CARD_STATUS[c.status]!.en}, limit ${money(c.limitFils, l)}.`,
            `${c.name.ar} المنتهية بـ${c.last4}: بحد ${money(c.limitFils, l)}، وهي ${CARD_STATUS[c.status]!.ar}.`,
          ),
        );
        return {
          text: pick(l, `You have ${r.cards.length} ${r.cards.length === 1 ? 'card' : 'cards'}. `, `لديك ${r.cards.length} من البطاقات. `) + lines.join(' '),
          cards: [{ kind: 'list', title: pick(l, 'My cards', 'بطاقاتي'), items: r.cards.map((c) => ({ title: c.name[l], detail: `•••• ${c.last4} · ${CARD_STATUS[c.status]![l]} · ${money(c.limitFils, l)}` })) }],
          actions: [navigate('account', pick(l, 'View my cards', 'عرض بطاقاتي'), '/account')],
          suggestions: suggest(l, 'pre', 'next'),
        };
      }
      const o = r.bestOffer;
      return {
        text: o
          ? pick(
              l,
              `You don't have an IMTIAZ card yet. You're eligible for the ${o.name.en}, with a limit of up to ${money(o.offeredLimitFils, l)}.`,
              `ليست لديك بطاقة امتياز بعد. أنت مؤهل لـ${o.name.ar} بحد يصل إلى ${money(o.offeredLimitFils, l)}، ويمكنك التقديم الآن.`,
            )
          : pick(l, "You don't have an IMTIAZ card yet. See which cards fit you.", 'ليست لديك بطاقة امتياز بعد. اطّلع على البطاقات المناسبة لك.'),
        cards: [],
        actions: [
          ...(o ? [navigate(`apply-${o.cardId}`, pick(l, `Apply for ${o.name.en}`, `قدّم على ${o.name.ar}`), `/cards/${o.cardId}/apply`)] : []),
          navigate('cards', pick(l, 'Compare cards', 'قارن البطاقات'), '/cards'),
        ],
        suggestions: suggest(l, 'pre', 'cars'),
      };
    }

    case 'request_human_handoff':
      return {
        text: pick(
          l,
          `I'll pass this to a BCFC customer service agent. Your reference is ${r.reference}. ⚠️ Sandbox: no agent is connected in this demo; in the live app an agent continues this chat.`,
          `سأحوّل محادثتك إلى أحد موظفي خدمة العملاء في البحرين للتسهيلات. رقم المرجع ${r.reference}. ⚠️ بيئة تجريبية: لا يوجد موظف متصل في هذا العرض؛ في التطبيق الفعلي يكمل الموظف هذه المحادثة.`,
        ),
        cards: [],
        actions: [],
        suggestions: suggest(l, 'balance', 'next'),
      };
  }
}

const CAPABILITIES: Localized = {
  en: 'I can tell you what you still owe, when your next installment is due, what early settlement would cost, find cars within your monthly budget, show your pre-approval, insurance and cards, or connect you to an agent. Ask in English or Arabic.',
  ar: 'أقدر أقول لك كم المتبقي عليك، ومتى قسطك القادم، وكم يكلف السداد المبكر، وأبحث لك عن سيارات ضمن ميزانيتك الشهرية، وأعرض موافقتك المسبقة وتأميناتك وبطاقاتك، أو أحوّلك إلى موظف. اسأل بالعربي أو بالإنجليزي.',
};

/** Greeting for the chosen persona (the only place Suhail and Suhaila differ). */
export function personaGreeting(persona: AssistantPersona, l: L): string {
  const name = PERSONA_NAME[persona][l];
  return persona === 'suhail'
    ? pick(l, `Hi! I'm ${name}, your BCFC assistant.`, `هلا! أنا ${name}، مساعدك الرقمي في البحرين للتسهيلات.`)
    : pick(l, `Hi! I'm ${name}, your BCFC assistant.`, `هلا! أنا ${name}، مساعدتك الرقمية في البحرين للتسهيلات.`);
}

/** Replies that need no tool. */
export function presentSmallTalk(intent: Extract<AssistantIntent, 'greeting' | 'help' | 'thanks' | 'unknown'>, persona: AssistantPersona, l: L): Presentation {
  switch (intent) {
    case 'greeting':
      return { text: `${personaGreeting(persona, l)} ${CAPABILITIES[l]}`, cards: [], actions: [], suggestions: starterSuggestions(l) };
    case 'help':
      return { text: CAPABILITIES[l], cards: [], actions: [], suggestions: [...starterSuggestions(l), SUGGEST.agent[l]] };
    case 'thanks':
      return { text: pick(l, "You're welcome! Anything else?", 'العفو! تحتاج شي ثاني؟'), cards: [], actions: [], suggestions: suggest(l, 'next', 'cars') };
    case 'unknown':
      return {
        text: pick(
          l,
          "Sorry, I didn't catch that. I can help with your installments, early settlement, cars within your budget, pre-approval, insurance and cards, or connect you to an agent. Try one of these:",
          'عذراً، ما فهمت عليك. أقدر أساعدك في الأقساط، والسداد المبكر، والسيارات ضمن ميزانيتك، والموافقة المسبقة، والتأمين، والبطاقات، أو أحوّلك إلى موظف. جرّب أحد هذه:',
        ),
        cards: [],
        actions: [],
        suggestions: [...starterSuggestions(l), SUGGEST.agent[l]],
      };
  }
}

/** "Yes" after a suggested action: remind the customer that they confirm it themselves. */
export function presentConfirm(previous: AssistantAction[] | undefined, l: L): Presentation {
  const actions = (previous ?? []).filter((a) => a.kind === 'payment');
  if (actions.length === 0) {
    return { text: pick(l, 'What would you like me to do?', 'شنو تبيني أسوي لك؟'), cards: [], actions: [], suggestions: starterSuggestions(l) };
  }
  return {
    text: pick(
      l,
      `I can't make payments myself. Tap “${actions[0]!.label}” to open the checkout, then review and confirm there.`,
      `ما أقدر أدفع بنفسي. اضغط «${actions[0]!.label}» لفتح صفحة الدفع، وراجع المبلغ وأكّده هناك.`,
    ),
    cards: [],
    actions,
    suggestions: suggest(l, 'balance', 'next'),
  };
}
