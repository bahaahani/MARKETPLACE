import { bhd, type Fils } from '../money';
import type { BodyType, FuelType, VehicleCondition } from '../types';
import { normalizeText } from './normalize';

/**
 * Rules-based intent detection for Suhail & Suhaila (English and Arabic, including common Bahraini / Gulf phrasings).
 *
 * Keywords are normalized like the customer's text (see normalize.ts), so "السيارة" / "السياره" / "السيارہ" and
 * "٢٠٠" / "200" match the same rule. English keywords match whole words (an "s" plural is allowed). Arabic keywords
 * match at the start of a word, after the usual attached prefixes (و ف ب ل ك ال لل), with any suffix, so "قسطي",
 * "بالقسط" and "الأقساط" all match "قسط".
 *
 * ⚠️ Deterministic placeholder for a language model: easy to test, but it only understands what the rules list.
 * Unknown text gets a polite fallback with suggestions rather than a guess.
 */

export type AssistantIntent =
  | 'outstanding_balance'
  | 'next_installment'
  | 'settlement_quote'
  | 'find_cars'
  | 'pre_approval'
  | 'policies'
  | 'card_status'
  | 'handoff'
  | 'help'
  | 'greeting'
  | 'thanks'
  | 'confirm'
  | 'unknown';

export const ASSISTANT_INTENTS: AssistantIntent[] = [
  'outstanding_balance',
  'next_installment',
  'settlement_quote',
  'find_cars',
  'pre_approval',
  'policies',
  'card_status',
  'handoff',
  'help',
  'greeting',
  'thanks',
  'confirm',
  'unknown',
];

export interface IntentSlots {
  /** Which contract the customer means ("the car", "personal finance") */
  contract?: 'vehicle' | 'personal';
  maxMonthlyFils?: Fils;
  maxPriceFils?: Fils;
  bodyType?: BodyType;
  fuel?: FuelType;
  condition?: VehicleCondition;
  make?: string;
  /** "expiring", "renew": only what ends soon */
  expiringOnly?: boolean;
}

export interface DetectedIntent {
  intent: AssistantIntent;
  slots: IntentSlots;
  /** Rule score of the winning intent (0 for unknown) */
  score: number;
  /** The normalized text the rules ran on */
  normalized: string;
}

type Scored = Exclude<AssistantIntent, 'confirm' | 'unknown'>;

// Higher weight = stronger signal. Ties go to the intent listed first in PRIORITY.
const RULES: Record<Scored, [weight: number, terms: string[]][]> = {
  settlement_quote: [
    [
      5,
      [
        'settle', 'settlement', 'settling', 'pay off', 'pay it off', 'pay it all', 'pay everything', 'payoff', 'pay all', 'pay the rest',
        'close my loan', 'close the loan', 'close my contract', 'clear my loan', 'clear the loan', 'full payment', 'pay in full', 'early payment',
        'سداد مبكر', 'تسديد مبكر', 'السداد المبكر', 'تسويه', 'سداد كامل', 'اسدد كل', 'اسدد الباقي', 'اسدد المبلغ كامل', 'اسدد كامل',
        'اخلص القرض', 'اخلص من القرض', 'اخلص التمويل', 'اسكر القرض', 'اسكر التمويل', 'سكر القرض', 'اقفل القرض', 'اقفل التمويل',
        'اغلق القرض', 'ادفع كل', 'ادفع الباقي', 'ادفعه كله', 'مره وحده', 'دفعه وحده',
      ],
    ],
  ],
  outstanding_balance: [
    [
      3,
      [
        'owe', 'owing', 'still owe', 'outstanding', 'balance', 'remaining', 'left to pay', 'how much left', 'how much is left', 'debt', 'amount left',
        'باقي', 'متبقي', 'يتبقي', 'رصيد', 'مديونيه', 'مديون', 'كم علي', 'اللي علي', 'ظل علي', 'كم ظل', 'المطلوب مني',
      ],
    ],
  ],
  next_installment: [
    [3, ['pay my installment', 'pay the installment', 'pay installment', 'pay my monthly', 'ادفع قسط', 'ادفع القسط', 'اسدد القسط', 'اسدد قسط']],
    [
      3,
      [
        'next installment', 'next payment', 'due date', 'when is my', 'when s my', 'when do i pay', 'next due', 'installment due', 'upcoming payment',
        'موعد', 'استحقاق', 'متي ادفع', 'متي القسط', 'القسط الجاي', 'القسط القادم', 'الدفعه الجايه', 'الدفعه القادمه',
      ],
    ],
    [2, ['installment', 'instalment', 'monthly payment', 'قسط', 'اقساط']],
    [1, ['when', 'next', 'due', 'متي', 'جاي', 'قادم', 'دفعه']],
  ],
  find_cars: [
    [2, ['find', 'show', 'looking for', 'look for', 'want', 'need', 'buy', 'recommend', 'search', 'suggest', 'cheapest', 'options', 'any',
      'ابي', 'ابا', 'ابغي', 'اريد', 'ودي', 'دور', 'دورلي', 'ابحث', 'اشتري', 'شوف لي', 'عطني', 'اقترح', 'ارخص', 'خيارات', 'في عندكم']],
  ],
  pre_approval: [
    [
      4,
      [
        'pre-approval', 'pre approval', 'preapproval', 'pre-approved', 'preapproved', 'pre approved', 'how much can i borrow', 'how much can i get',
        'borrow', 'eligible', 'eligibility', 'qualify', 'my limit', 'finance limit', 'how much finance',
        'موافقه مسبقه', 'موافقه مبدييه', 'اقدر اخذ', 'اقدر اقترض', 'اقترض', 'اتمول', 'حدود التمويل', 'الحد الاعلي', 'موهل', 'استاهل',
        'كم يعطوني', 'اقدر احصل', 'شكثر اقدر', 'كم اقدر',
      ],
    ],
    [1, ['afford', 'limit', 'تمويل']],
  ],
  policies: [
    [3, ['insurance', 'insured', 'policy', 'policies', 'cover', 'takaful', 'تامين', 'بوليصه', 'وثيقه', 'تغطيه', 'تكافل']],
    [2, ['renew', 'renewal', 'expire', 'expiring', 'expires', 'expiry', 'تجديد', 'اجدد', 'ينتهي', 'تنتهي', 'انتهاء', 'يخلص', 'تخلص']],
  ],
  card_status: [
    [3, ['card', 'credit card', 'imtiaz', 'mastercard', 'virtual card', 'بطاقه', 'بطاقات', 'بطاقتي', 'كرت', 'كارت', 'امتياز', 'ماستركارد', 'فيزا']],
  ],
  handoff: [
    [
      5,
      [
        'agent', 'human', 'real person', 'a person', 'representative', 'customer service', 'call me', 'speak to', 'talk to', 'complaint', 'complain',
        'call center', 'someone',
        'موظف', 'انسان', 'شخص حقيقي', 'خدمه العملاء', 'اكلم', 'كلمني', 'اتصلوا', 'اتصال', 'شكوي', 'احد يكلمني', 'ممثل', 'كول سنتر',
      ],
    ],
  ],
  help: [[1, ['help', 'what can you do', 'how does this work', 'مساعده', 'ساعدني', 'شنو تقدر', 'شو تقدر', 'وش تقدر', 'ماذا تستطيع', 'ايش تسوي', 'شنو تسوي']]],
  greeting: [[1, ['hi', 'hello', 'hey', 'salam', 'assalam', 'good morning', 'good evening', 'marhaba', 'مرحبا', 'هلا', 'اهلا', 'السلام عليكم', 'سلام', 'صباح الخير', 'مساء الخير', 'شلونك', 'كيف حالك', 'هاي']]],
  thanks: [[1, ['thanks', 'thank you', 'thx', 'cheers', 'شكرا', 'مشكور', 'مشكوره', 'يعطيك العافيه', 'تسلم', 'الله يعطيك']]],
};

const PRIORITY: Scored[] = [
  'settlement_quote',
  'outstanding_balance',
  'next_installment',
  'handoff',
  'policies',
  'card_status',
  'pre_approval',
  'find_cars',
  'help',
  'greeting',
  'thanks',
];

const VEHICLE_WORDS = ['car', 'vehicle', 'auto', 'suv', 'sedan', 'hatchback', 'pickup', 'truck', 'coupe', '4x4', 'jeep',
  'سياره', 'سيارات', 'موتر', 'جيب', 'سيدان', 'صالون', 'بيك اب', 'ونيت', 'وانيت', 'هاتشباك', 'كوبيه', 'دفع رباعي'];

const CONTRACT_WORDS: Record<'vehicle' | 'personal', string[]> = {
  vehicle: ['car', 'vehicle', 'auto', 'honda', 'cr-v', 'crv', 'murabaha', 'سياره', 'سيارتي', 'موتر', 'موتري', 'هوندا', 'مرابحه'],
  personal: ['personal', 'شخصي'],
};

const BODY_TYPES: Record<BodyType, string[]> = {
  suv: ['suv', '4x4', 'jeep', 'crossover', 'family car', 'جيب', 'دفع رباعي', 'اس يو في', 'عائليه'],
  sedan: ['sedan', 'saloon', 'سيدان', 'صالون'],
  hatchback: ['hatchback', 'small car', 'compact', 'هاتشباك', 'صغيره'],
  pickup: ['pickup', 'pick up', 'pick-up', 'truck', 'بيك اب', 'بيكب', 'ونيت', 'وانيت'],
  coupe: ['coupe', 'sports car', 'كوبيه', 'رياضيه'],
};

const FUELS: Record<FuelType, string[]> = {
  electric: ['electric', 'ev', 'كهربائي', 'كهربا'],
  hybrid: ['hybrid', 'هايبرد', 'هايبريد', 'هجين'],
  petrol: ['petrol', 'gasoline', 'بنزين'],
};

const CONDITIONS: Record<VehicleCondition, string[]> = {
  new: ['new', 'brand new', 'جديد', 'وكاله'],
  used: ['used', 'second hand', 'pre-owned', 'preowned', 'مستعمل', 'مستخدم'],
};

const MAKES: Record<string, string[]> = {
  Honda: ['honda', 'هوندا'],
  Toyota: ['toyota', 'تويوتا'],
  Nissan: ['nissan', 'نيسان'],
  Kia: ['kia', 'كيا'],
  Hyundai: ['hyundai', 'هيونداي', 'هونداي'],
  Tesla: ['tesla', 'تسلا'],
  Ford: ['ford', 'فورد'],
  HAVAL: ['haval', 'هافال'],
  Cadillac: ['cadillac', 'كاديلاك', 'كادلك'],
};

const MONTH_WORDS = ['month', 'monthly', 'mo', 'pm', 'p m', 'a month', 'per month', 'شهر', 'شهري', 'شهريا', 'شهريه'];
const BUDGET_WORDS = ['under', 'below', 'less than', 'max', 'up to', 'within', 'budget', 'at most',
  'تحت', 'اقل من', 'بحدود', 'حدود', 'ميزانيتي', 'ميزانيه', 'ما يزيد', 'لين', 'الي'];

const CONFIRM_WORDS = new Set(
  ['yes', 'yeah', 'yep', 'ok', 'okay', 'sure', 'do', 'it', 'go', 'ahead', 'please', 'proceed', 'confirm',
    'نعم', 'ايوه', 'ايه', 'اي', 'اوكي', 'تمام', 'يلا', 'سوها', 'اكيد', 'زين', 'ابشر', 'لو', 'سمحت'].map(normalizeText),
);

const ARABIC = /[؀-ۿ]/;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A matcher for one keyword (normalized once). */
function matcher(term: string): RegExp {
  const t = normalizeText(term);
  if (!ARABIC.test(t)) return new RegExp(`(?:^|\\s)${escape(t)}(?:s|es)?(?=\\s|$)`);
  // Every word may carry the attached prefixes ("السداد المبكر" matches "سداد مبكر"); suffixes are free.
  const prefix = '(?:و|ف)?(?:ب|ل|ك)?(?:ال|لل)?';
  return new RegExp(`(?:^|\\s)${t.split(' ').map((w) => prefix + escape(w.length > 4 ? w.replace(/^ال/, '') : w)).join('\\S*\\s')}`);
}

const compiled = new Map<string, RegExp>();
function has(text: string, term: string): boolean {
  let re = compiled.get(term);
  if (!re) compiled.set(term, (re = matcher(term)));
  return re.test(text);
}
const hasAny = (text: string, terms: string[]) => terms.some((t) => has(text, t));
function firstKey<K extends string>(text: string, table: Record<K, string[]>): K | undefined {
  return (Object.keys(table) as K[]).find((k) => hasAny(text, table[k]));
}

/** Budget from text like "under 200 a month", "تحت ٢٠٠ بالشهر", "below 10k", "بحدود 8 آلاف". */
export function extractBudget(normalized: string): Pick<IntentSlots, 'maxMonthlyFils' | 'maxPriceFils'> {
  const nums = [...normalized.matchAll(/(\d+(?:\.\d+)?)(?:\s*(k|الف|الاف)(?!\p{L}))?/gu)]
    .map((m) => ({ value: Number(m[1]) * (m[2] ? 1000 : 1), thousands: !!m[2] }))
    // Model years ("a 2024 SUV") are not budgets.
    .filter((n) => n.thousands || !(Number.isInteger(n.value) && n.value >= 1990 && n.value <= 2035))
    .filter((n) => n.value > 0);
  const n = nums[0];
  if (!n) return {};
  const monthly = hasAny(normalized, MONTH_WORDS);
  const amount = bhd(n.value);
  if (monthly) return { maxMonthlyFils: amount };
  if (n.value >= 1000) return { maxPriceFils: amount };
  // "an SUV under 200": nobody buys a car for BHD 200, so a small budget is per month.
  return hasAny(normalized, BUDGET_WORDS) || n.value < 1000 ? { maxMonthlyFils: amount } : {};
}

function slotsFor(text: string): IntentSlots {
  const slots: IntentSlots = { ...extractBudget(text) };
  const contract = firstKey(text, CONTRACT_WORDS);
  if (contract) slots.contract = contract;
  const bodyType = firstKey(text, BODY_TYPES);
  if (bodyType) slots.bodyType = bodyType;
  const fuel = firstKey(text, FUELS);
  if (fuel) slots.fuel = fuel;
  const condition = firstKey(text, CONDITIONS);
  if (condition) slots.condition = condition;
  const make = firstKey(text, MAKES);
  if (make) slots.make = make;
  if (hasAny(text, RULES.policies[1]![1])) slots.expiringOnly = true;
  return slots;
}

/** Scores every intent for the text; exported for tests and for tuning the rules. */
export function scoreIntents(text: string): Record<Scored, number> {
  const scores = Object.fromEntries(PRIORITY.map((i) => [i, 0])) as Record<Scored, number>;
  for (const intent of PRIORITY) {
    for (const [weight, terms] of RULES[intent]) if (hasAny(text, terms)) scores[intent] += weight;
  }
  // Car search needs a vehicle word; budget and body type make it a strong match.
  const vehicle = hasAny(text, VEHICLE_WORDS) || firstKey(text, BODY_TYPES) !== undefined || firstKey(text, MAKES) !== undefined;
  if (!vehicle) scores.find_cars = 0;
  else {
    scores.find_cars += 1;
    const b = extractBudget(text);
    if (b.maxMonthlyFils !== undefined || b.maxPriceFils !== undefined) scores.find_cars += 3;
    if (firstKey(text, BODY_TYPES)) scores.find_cars += 2;
  }
  // A lone "when" / "next" is not about installments.
  if (scores.next_installment === 1) scores.next_installment = 0;
  return scores;
}

export function detectIntent(raw: string): DetectedIntent {
  const normalized = normalizeText(raw);
  const words = normalized.split(' ').filter(Boolean);
  if (words.length > 0 && words.length <= 4 && words.every((w) => CONFIRM_WORDS.has(w)) && !['it', 'do', 'go', 'please', 'لو', 'سمحت'].includes(normalized)) {
    return { intent: 'confirm', slots: {}, score: 1, normalized };
  }
  const scores = scoreIntents(normalized);
  let best: Scored | undefined;
  for (const i of PRIORITY) if (scores[i] > 0 && (best === undefined || scores[i] > scores[best])) best = i;
  if (!best) return { intent: 'unknown', slots: {}, score: 0, normalized };
  return { intent: best, slots: slotsFor(normalized), score: scores[best], normalized };
}
