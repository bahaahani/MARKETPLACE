import type { Fils } from './money';
import { bhd } from './money';
import { maxMonthlyInstallment, type CustomerFinancials } from './affordability';
import { offeredCardLimit } from './cards';
import { CARDS, findProperty, findVehicle, VEHICLES } from './catalog';
import { quoteFinance } from './pricing';
import { LISTING_DEFAULTS, RATE_CARDS } from './rates';
import type { FinanceStructure, Localized, ProductLine, Property, Vehicle } from './types';

/**
 * Life-Event Engine (crazy idea #2): when a customer signals a life event, assemble a bundle from the
 * existing building blocks (catalog, pricing engine, card eligibility) and check it against their DBR headroom.
 *
 * Curated, rules-based and deterministic (no AI, no randomness): the same customer, event and structure
 * always produce the same bundle.
 * ⚠️ ILLUSTRATIVE. Products, amounts and placeholder premiums are demo values, not offers.
 */

export type LifeEventId = 'married' | 'new-job' | 'first-home' | 'new-baby';

export const LIFE_EVENT_IDS: LifeEventId[] = ['married', 'new-job', 'first-home', 'new-baby'];

export interface LifeEvent {
  id: LifeEventId;
  /** Emoji shown on the tile (both apps) */
  icon: string;
  title: Localized;
  subtitle: Localized;
}

export const LIFE_EVENTS: LifeEvent[] = [
  {
    id: 'married',
    icon: '💍',
    title: { en: 'Getting married', ar: 'مقبل على الزواج' },
    subtitle: { en: 'Wedding, a car, a home and the honeymoon', ar: 'الزفاف وسيارة ومنزل وشهر العسل' },
  },
  {
    id: 'new-job',
    icon: '💼',
    title: { en: 'New job or salary increase', ar: 'وظيفة جديدة أو زيادة في الراتب' },
    subtitle: { en: 'A better card and a new car', ar: 'بطاقة أفضل وسيارة جديدة' },
  },
  {
    id: 'first-home',
    icon: '🏠',
    title: { en: 'Buying my first home', ar: 'شراء منزلي الأول' },
    subtitle: { en: 'Home finance, cover and furniture', ar: 'تمويل المنزل والتأمين والأثاث' },
  },
  {
    id: 'new-baby',
    icon: '👶',
    title: { en: 'New baby', ar: 'مولود جديد' },
    subtitle: { en: 'A family car and protection', ar: 'سيارة عائلية وحماية للأسرة' },
  },
];

/** Whole-bundle toggle: every financed item uses the Islamic structure offered for its line, or conventional. */
export type BundleStructure = 'islamic' | 'conventional';

export const BUNDLE_STRUCTURES: BundleStructure[] = ['islamic', 'conventional'];

export type BundleItemKind =
  | 'personal-finance'
  | 'vehicle'
  | 'home-finance'
  | 'home-rent-to-own'
  | 'card'
  | 'travel'
  | 'home-cover'
  | 'life-cover';

export interface BundleItem {
  id: string;
  kind: BundleItemKind;
  title: Localized;
  description: Localized;
  /** In-app path without the locale prefix, identical on web (/{locale}{href}) and mobile. */
  href?: string;
  /** Financed items only */
  productLine?: ProductLine;
  structure?: FinanceStructure;
  assetPriceFils?: Fils;
  downPaymentFils?: Fils;
  financedFils?: Fils;
  tenureMonths?: number;
  /** Interest (conventional) or profit (Islamic). Label it from `structure`, never "interest" for Islamic. */
  costOfFinanceFils?: Fils;
  /** Card suggestion only */
  cardId?: string;
  annualFeeFils?: Fils;
  cardLimitFils?: Fils;
  /** Installment from the pricing engine, or an indicative premium for cover placeholders, 0 when not applicable */
  monthlyFils: Fils;
  /** Financed items count toward the debt-burden ratio; premiums and cards (no balance yet) do not. */
  countsTowardDbr: boolean;
  /** ⚠️ Not a live product yet (coming soon / partner integration pending) */
  placeholder: boolean;
}

export type BundleVerdict = 'fits' | 'over-budget';

export interface LifeEventBundle {
  event: LifeEvent;
  structure: BundleStructure;
  items: BundleItem[];
  /** Sum of the financed items' installments (what the DBR cap applies to) */
  totalMonthlyFils: Fils;
  /** Indicative premiums of cover placeholders, outside the DBR check */
  otherMonthlyFils: Fils;
  /** DBR headroom: highest new monthly installment allowed */
  maxMonthlyFils: Fils;
  /** maxMonthlyFils - totalMonthlyFils (negative when over budget) */
  headroomAfterFils: Fils;
  verdict: BundleVerdict;
  /** How much the bundle is over the headroom (0 when it fits) */
  shortfallFils: Fils;
  illustrative: true;
}

export class LifeEventError extends Error {
  constructor(
    public readonly code: 'EVENT_NOT_FOUND' | 'INVALID_STRUCTURE' | 'INVALID_AMOUNT',
    message: string,
  ) {
    super(message);
    this.name = 'LifeEventError';
  }
}

export function findLifeEvent(id: string): LifeEvent | undefined {
  return LIFE_EVENTS.find((e) => e.id === id);
}

export function isBundleStructure(s: unknown): s is BundleStructure {
  return typeof s === 'string' && (BUNDLE_STRUCTURES as string[]).includes(s);
}

/** The structure a line uses under the bundle toggle: the first Islamic structure offered for it, or conventional. */
export function structureFor(productLine: ProductLine, structure: BundleStructure): FinanceStructure {
  if (structure === 'conventional') return 'conventional';
  return RATE_CARDS[productLine].structures.find((s) => s !== 'conventional') ?? 'conventional';
}

// ⚠️ Placeholder bundle rules. Amounts and tenures are illustrative, chosen by product, not by a model.
const WEDDING_FINANCE_FILS = bhd(5_000);
const FURNITURE_FINANCE_FILS = bhd(4_000);
const PERSONAL_TENURE_MONTHS = 48;
const FURNITURE_TENURE_MONTHS = 36;
/** Bundled cars and homes reuse the listing defaults (down payment and tenure), so figures match the listing pages. */
const WEDDING_CAR_ID = 'v-honda-city-2026';
const NEW_JOB_CAR_ID = 'v-haval-jolion-2026';
const STARTER_HOME_ID = 'p-amwaj-apt-2br';
/** ⚠️ Placeholder home cover premium: 0.08% of the property value per year. */
const HOME_COVER_RATE_BP = 8;
/** ⚠️ Placeholder life / family Takaful cover premium per month. */
const LIFE_COVER_MONTHLY_FILS = bhd(9);
/** Family car: at least this many seats. */
const FAMILY_MIN_SEATS = 7;

function personalItem(
  id: string,
  amountFils: Fils,
  tenureMonths: number,
  title: Localized,
  description: Localized,
  structure: BundleStructure,
): BundleItem {
  const s = structureFor('personal', structure);
  const q = quoteFinance({ productLine: 'personal', structure: s, assetPriceFils: amountFils, downPaymentFils: 0, tenureMonths });
  return {
    id,
    kind: 'personal-finance',
    title,
    description,
    href: '/finance/personal',
    productLine: 'personal',
    structure: s,
    assetPriceFils: amountFils,
    downPaymentFils: 0,
    financedFils: q.financedFils,
    tenureMonths: q.tenureMonths,
    costOfFinanceFils: q.costOfFinanceFils,
    monthlyFils: q.monthlyFils,
    countsTowardDbr: true,
    placeholder: false,
  };
}

function vehicleItem(id: string, v: Vehicle, description: Localized, structure: BundleStructure): BundleItem {
  const s = structureFor('vehicle', structure);
  const d = LISTING_DEFAULTS.vehicle;
  const q = quoteFinance({
    productLine: 'vehicle',
    structure: s,
    assetPriceFils: v.priceFils,
    downPaymentFils: Math.ceil((v.priceFils * d.downPaymentPct) / 100),
    tenureMonths: d.tenureMonths,
  });
  const name = `${v.make} ${v.model} ${v.year}`;
  return {
    id,
    kind: 'vehicle',
    title: { en: name, ar: name },
    description,
    href: `/cars/${v.id}`,
    productLine: 'vehicle',
    structure: s,
    assetPriceFils: v.priceFils,
    downPaymentFils: q.downPaymentFils,
    financedFils: q.financedFils,
    tenureMonths: q.tenureMonths,
    costOfFinanceFils: q.costOfFinanceFils,
    monthlyFils: q.monthlyFils,
    countsTowardDbr: true,
    placeholder: false,
  };
}

function homeItem(id: string, p: Property, kind: 'home-finance' | 'home-rent-to-own', structure: BundleStructure): BundleItem {
  const s = structureFor('home', structure);
  const d = LISTING_DEFAULTS.home;
  const q = quoteFinance({
    productLine: 'home',
    structure: s,
    assetPriceFils: p.priceFils,
    downPaymentFils: Math.ceil((p.priceFils * d.downPaymentPct) / 100),
    tenureMonths: d.tenureMonths,
  });
  const islamic = s !== 'conventional';
  const description: Localized =
    kind === 'home-rent-to-own'
      ? islamic
        ? { en: `Rent-to-own (Ijara Muntahia Bittamleek): ${p.title.en}, ${p.area.en}`, ar: `إيجار منتهي بالتمليك: ${p.title.ar}، ${p.area.ar}` }
        : { en: `Home finance suggestion: ${p.title.en}, ${p.area.en}`, ar: `اقتراح تمويل منزل: ${p.title.ar}، ${p.area.ar}` }
      : { en: `Pre-approval check on ${p.title.en}, ${p.area.en}`, ar: `تحقق من الموافقة المبدئية على ${p.title.ar}، ${p.area.ar}` };
  return {
    id,
    kind,
    title:
      kind === 'home-rent-to-own' && islamic
        ? { en: 'Home rent-to-own', ar: 'منزل بالإيجار المنتهي بالتمليك' }
        : { en: 'Home finance', ar: 'تمويل المنزل' },
    description,
    href: `/property/${p.id}`,
    productLine: 'home',
    structure: s,
    assetPriceFils: p.priceFils,
    downPaymentFils: q.downPaymentFils,
    financedFils: q.financedFils,
    tenureMonths: q.tenureMonths,
    costOfFinanceFils: q.costOfFinanceFils,
    monthlyFils: q.monthlyFils,
    countsTowardDbr: true,
    // Ijara home finance is "coming soon" on the rate card.
    placeholder: s === 'ijara',
  };
}

function homeCoverItem(p: Property, structure: BundleStructure): BundleItem {
  const annual = Math.round((p.priceFils * HOME_COVER_RATE_BP) / 10_000);
  const takaful = structure === 'islamic';
  return {
    id: 'home-cover',
    kind: 'home-cover',
    title: takaful ? { en: 'Home Takaful', ar: 'تكافل المنزل' } : { en: 'Home insurance', ar: 'تأمين المنزل' },
    description: { en: 'Building and contents cover through Tasheelat Insurance (coming soon)', ar: 'تغطية المبنى والمحتويات عبر تسهيلات للتأمين (قريباً)' },
    monthlyFils: Math.ceil(annual / 12),
    countsTowardDbr: false,
    placeholder: true,
  };
}

function lifeCoverItem(structure: BundleStructure): BundleItem {
  const takaful = structure === 'islamic';
  return {
    id: 'life-cover',
    kind: 'life-cover',
    title: takaful ? { en: 'Family Takaful', ar: 'التكافل العائلي' } : { en: 'Life cover', ar: 'تأمين على الحياة' },
    description: { en: 'Protection for your family (partner product, coming soon)', ar: 'حماية لعائلتك (منتج شريك، قريباً)' },
    monthlyFils: LIFE_COVER_MONTHLY_FILS,
    countsTowardDbr: false,
    placeholder: true,
  };
}

function travelItem(): BundleItem {
  return {
    id: 'honeymoon',
    kind: 'travel',
    title: { en: 'Honeymoon travel', ar: 'رحلة شهر العسل' },
    description: { en: 'Travel packages with partners (coming soon)', ar: 'باقات سفر مع الشركاء (قريباً)' },
    monthlyFils: 0,
    countsTowardDbr: false,
    placeholder: true,
  };
}

const CARD_TIER_RANK = { 'world-elite': 4, world: 3, platinum: 2, youth: 1, prepaid: 0 } as const;

/**
 * Card upgrade suggestion from card eligibility: the highest-tier credit card the customer qualifies for
 * (salary at or above the card minimum, DBR headroom for a credit line). "For Her" cards are only suggested
 * when asked for, since the engine does not use gender.
 */
export function suggestCardUpgrade(f: CustomerFinancials, now: Date = new Date()) {
  const eligible = CARDS.filter((c) => c.tier !== 'prepaid' && !c.forHer && f.monthlySalaryFils >= c.minSalaryFils)
    .map((card) => ({ card, limitFils: offeredCardLimit(card, f, now) }))
    .filter((x) => x.limitFils > 0)
    .sort(
      (a, b) =>
        CARD_TIER_RANK[b.card.tier] - CARD_TIER_RANK[a.card.tier] ||
        b.card.minSalaryFils - a.card.minSalaryFils ||
        a.card.id.localeCompare(b.card.id),
    );
  return eligible[0];
}

function cardItem(f: CustomerFinancials, now: Date): BundleItem | undefined {
  const best = suggestCardUpgrade(f, now);
  if (!best) return undefined;
  return {
    id: 'card-upgrade',
    kind: 'card',
    title: best.card.name,
    description: { en: 'Card upgrade you qualify for, issued instantly', ar: 'ترقية بطاقة أنت مؤهل لها، تصدر فوراً' },
    href: `/cards/${best.card.id}/apply`,
    cardId: best.card.id,
    annualFeeFils: best.card.annualFeeFils,
    cardLimitFils: best.limitFils,
    monthlyFils: 0,
    countsTowardDbr: false,
    placeholder: false,
  };
}

/** Cheapest car with enough seats for a family. */
export function familyCar(minSeats = FAMILY_MIN_SEATS): Vehicle | undefined {
  return [...VEHICLES].filter((v) => v.seats >= minSeats).sort((a, b) => a.priceFils - b.priceFils || a.id.localeCompare(b.id))[0];
}

function mustVehicle(id: string): Vehicle {
  const v = findVehicle(id);
  if (!v) throw new Error(`bundle rule references unknown vehicle ${id}`);
  return v;
}

function mustProperty(id: string): Property {
  const p = findProperty(id);
  if (!p) throw new Error(`bundle rule references unknown property ${id}`);
  return p;
}

function itemsFor(event: LifeEventId, structure: BundleStructure, f: CustomerFinancials, now: Date): BundleItem[] {
  switch (event) {
    case 'married':
      return [
        personalItem(
          'wedding-finance',
          WEDDING_FINANCE_FILS,
          PERSONAL_TENURE_MONTHS,
          { en: 'Wedding finance', ar: 'تمويل الزفاف' },
          { en: 'Personal finance for the wedding', ar: 'تمويل شخصي لتكاليف الزفاف' },
          structure,
        ),
        vehicleItem('car', mustVehicle(WEDDING_CAR_ID), { en: 'A new car for the two of you', ar: 'سيارة جديدة لكما' }, structure),
        homeItem('home', mustProperty(STARTER_HOME_ID), 'home-rent-to-own', structure),
        travelItem(),
      ];
    case 'new-job': {
      const card = cardItem(f, now);
      return [
        ...(card ? [card] : []),
        vehicleItem('car', mustVehicle(NEW_JOB_CAR_ID), { en: 'Treat yourself to a new car', ar: 'كافئ نفسك بسيارة جديدة' }, structure),
      ];
    }
    case 'first-home': {
      const home = mustProperty(STARTER_HOME_ID);
      return [
        homeItem('home', home, 'home-finance', structure),
        homeCoverItem(home, structure),
        personalItem(
          'furniture-finance',
          FURNITURE_FINANCE_FILS,
          FURNITURE_TENURE_MONTHS,
          { en: 'Furniture finance', ar: 'تمويل الأثاث' },
          { en: 'Personal finance to furnish your home', ar: 'تمويل شخصي لتأثيث منزلك' },
          structure,
        ),
      ];
    }
    case 'new-baby': {
      const car = familyCar();
      return [
        ...(car
          ? [vehicleItem('family-car', car, { en: `Family SUV with ${car.seats} seats`, ar: `سيارة عائلية بـ ${car.seats} مقاعد` }, structure)]
          : []),
        lifeCoverItem(structure),
      ];
    }
  }
}

/**
 * Build the bundle for a life event and check it against the customer's DBR headroom.
 * Only financed items count toward the DBR; cover premiums are shown separately.
 */
export function buildLifeEventBundle(
  eventId: string,
  structure: string,
  f: CustomerFinancials,
  now: Date = new Date(),
): LifeEventBundle {
  const event = findLifeEvent(eventId);
  if (!event) throw new LifeEventError('EVENT_NOT_FOUND', `unknown life event ${eventId}`);
  if (!isBundleStructure(structure)) throw new LifeEventError('INVALID_STRUCTURE', 'structure must be islamic or conventional');
  if (
    !Number.isSafeInteger(f.monthlySalaryFils) ||
    !Number.isSafeInteger(f.existingObligationsFils) ||
    f.monthlySalaryFils < 0 ||
    f.existingObligationsFils < 0
  ) {
    throw new LifeEventError('INVALID_AMOUNT', 'salary and obligations must be non-negative integer fils');
  }
  const items = itemsFor(event.id, structure, f, now);
  const totalMonthlyFils = items.filter((i) => i.countsTowardDbr).reduce((s, i) => s + i.monthlyFils, 0);
  const otherMonthlyFils = items.filter((i) => !i.countsTowardDbr).reduce((s, i) => s + i.monthlyFils, 0);
  const maxMonthlyFils = maxMonthlyInstallment(f);
  const headroomAfterFils = maxMonthlyFils - totalMonthlyFils;
  return {
    event,
    structure,
    items,
    totalMonthlyFils,
    otherMonthlyFils,
    maxMonthlyFils,
    headroomAfterFils,
    verdict: headroomAfterFils >= 0 ? 'fits' : 'over-budget',
    shortfallFils: Math.max(0, -headroomAfterFils),
    illustrative: true,
  };
}
