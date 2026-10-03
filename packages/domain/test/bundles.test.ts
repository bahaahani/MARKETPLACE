import { describe, expect, it } from 'vitest';
import {
  bhd,
  buildLifeEventBundle,
  familyCar,
  findVehicle,
  LIFE_EVENT_IDS,
  LIFE_EVENTS,
  LifeEventError,
  maxMonthlyInstallment,
  quoteFinance,
  structureFor,
  suggestCardUpgrade,
  vehicleFromMonthly,
  type CustomerFinancials,
} from '../src';

const NOW = new Date('2026-10-03T09:00:00Z');
// The demo customer: salary BHD 1,400 with BHD 326.753 of installments, so BHD 373.247 of DBR headroom.
const FATIMA: CustomerFinancials = { monthlySalaryFils: bhd(1_400), existingObligationsFils: 326_753 };

describe('life events', () => {
  it('lists the four curated events in a stable order', () => {
    expect(LIFE_EVENTS.map((e) => e.id)).toEqual(['married', 'new-job', 'first-home', 'new-baby']);
    for (const e of LIFE_EVENTS) expect(e.title.en && e.title.ar && e.subtitle.en && e.subtitle.ar).toBeTruthy();
  });

  it('is deterministic: the same inputs give the same bundle', () => {
    for (const id of LIFE_EVENT_IDS) {
      for (const s of ['islamic', 'conventional']) {
        expect(buildLifeEventBundle(id, s, FATIMA, NOW)).toEqual(buildLifeEventBundle(id, s, FATIMA, NOW));
      }
    }
  });

  it('rejects unknown events, structures and non-integer money', () => {
    expect(() => buildLifeEventBundle('retirement', 'islamic', FATIMA, NOW)).toThrow(LifeEventError);
    expect(() => buildLifeEventBundle('married', 'murabaha', FATIMA, NOW)).toThrow(/islamic or conventional/);
    expect(() => buildLifeEventBundle('married', 'islamic', { monthlySalaryFils: 1.5, existingObligationsFils: 0 }, NOW)).toThrow(LifeEventError);
    expect(() =>
      buildLifeEventBundle('married', 'islamic', { monthlySalaryFils: Number.MAX_SAFE_INTEGER + 2, existingObligationsFils: 0 }, NOW),
    ).toThrow(LifeEventError);
  });
});

describe('bundle pricing', () => {
  it('prices every financed item with the pricing engine (same figure as the listing for cars)', () => {
    const b = buildLifeEventBundle('married', 'conventional', FATIMA, NOW);
    const car = b.items.find((i) => i.kind === 'vehicle')!;
    expect(car.href).toBe('/cars/v-honda-city-2026');
    expect(car.monthlyFils).toBe(vehicleFromMonthly(findVehicle('v-honda-city-2026')!, 'conventional'));
    const wedding = b.items.find((i) => i.id === 'wedding-finance')!;
    expect(wedding.monthlyFils).toBe(
      quoteFinance({ productLine: 'personal', structure: 'conventional', assetPriceFils: bhd(5_000), downPaymentFils: 0, tenureMonths: 48 }).monthlyFils,
    );
    for (const i of b.items) {
      expect(Number.isSafeInteger(i.monthlyFils)).toBe(true);
      expect(i.monthlyFils).toBeGreaterThanOrEqual(0);
    }
  });

  it('totals only financed items against the DBR headroom and gives a verdict', () => {
    for (const id of LIFE_EVENT_IDS) {
      for (const s of ['islamic', 'conventional']) {
        const b = buildLifeEventBundle(id, s, FATIMA, NOW);
        const dbr = b.items.filter((i) => i.countsTowardDbr).reduce((sum, i) => sum + i.monthlyFils, 0);
        expect(b.totalMonthlyFils).toBe(dbr);
        expect(b.maxMonthlyFils).toBe(maxMonthlyInstallment(FATIMA));
        expect(b.headroomAfterFils).toBe(b.maxMonthlyFils - b.totalMonthlyFils);
        expect(b.verdict).toBe(b.totalMonthlyFils <= b.maxMonthlyFils ? 'fits' : 'over-budget');
        expect(b.shortfallFils).toBe(Math.max(0, b.totalMonthlyFils - b.maxMonthlyFils));
        expect(b.illustrative).toBe(true);
      }
    }
  });

  it('gives the demo customer a mix of verdicts', () => {
    const v = (id: string) => buildLifeEventBundle(id, 'islamic', FATIMA, NOW).verdict;
    expect(v('new-job')).toBe('fits');
    expect(v('new-baby')).toBe('fits');
    expect(v('married')).toBe('over-budget');
    expect(v('first-home')).toBe('over-budget');
    // Pinned figures (illustrative rate cards): web, API and mobile fixtures must show the same.
    const married = buildLifeEventBundle('married', 'islamic', FATIMA, NOW);
    expect(married.totalMonthlyFils).toBe(799_233);
    expect(married.shortfallFils).toBe(799_233 - 373_247);
  });

  it('a customer with no headroom is over budget on every financed bundle', () => {
    const maxedOut = { monthlySalaryFils: bhd(1_000), existingObligationsFils: bhd(600) };
    for (const id of LIFE_EVENT_IDS) expect(buildLifeEventBundle(id, 'conventional', maxedOut, NOW).verdict).toBe('over-budget');
  });
});

describe('Islamic / conventional toggle', () => {
  it('switches every financed item to the Islamic structure offered for its line', () => {
    expect(structureFor('vehicle', 'islamic')).toBe('murabaha');
    expect(structureFor('personal', 'islamic')).toBe('murabaha');
    expect(structureFor('home', 'islamic')).toBe('ijara');
    for (const id of LIFE_EVENT_IDS) {
      const isl = buildLifeEventBundle(id, 'islamic', FATIMA, NOW);
      const conv = buildLifeEventBundle(id, 'conventional', FATIMA, NOW);
      for (const i of isl.items.filter((x) => x.productLine)) expect(i.structure).not.toBe('conventional');
      for (const i of conv.items.filter((x) => x.productLine)) expect(i.structure).toBe('conventional');
      expect(isl.items.map((i) => i.id)).toEqual(conv.items.map((i) => i.id));
    }
  });

  it('never calls an Islamic bundle "interest"; cover is Takaful', () => {
    for (const id of LIFE_EVENT_IDS) {
      const json = JSON.stringify(buildLifeEventBundle(id, 'islamic', FATIMA, NOW));
      expect(json.toLowerCase()).not.toContain('interest');
      expect(json).not.toMatch(/فائدة|فوائد/);
    }
    const baby = buildLifeEventBundle('new-baby', 'islamic', FATIMA, NOW);
    expect(baby.items.find((i) => i.kind === 'life-cover')!.title.en).toBe('Family Takaful');
    const home = buildLifeEventBundle('married', 'islamic', FATIMA, NOW).items.find((i) => i.kind === 'home-rent-to-own')!;
    expect(home.structure).toBe('ijara');
    expect(home.title.en).toBe('Home rent-to-own');
  });
});

describe('bundle contents', () => {
  it('married: wedding finance, car, home rent-to-own, honeymoon placeholder', () => {
    const b = buildLifeEventBundle('married', 'islamic', FATIMA, NOW);
    expect(b.items.map((i) => i.kind)).toEqual(['personal-finance', 'vehicle', 'home-rent-to-own', 'travel']);
    const travel = b.items.at(-1)!;
    expect(travel.placeholder).toBe(true);
    expect(travel.monthlyFils).toBe(0);
    expect(travel.countsTowardDbr).toBe(false);
  });

  it('first home: home finance pre-approval, home cover placeholder, furniture finance', () => {
    const b = buildLifeEventBundle('first-home', 'conventional', FATIMA, NOW);
    expect(b.items.map((i) => i.kind)).toEqual(['home-finance', 'home-cover', 'personal-finance']);
    const cover = b.items[1]!;
    expect(cover.countsTowardDbr).toBe(false);
    expect(cover.placeholder).toBe(true);
    expect(b.otherMonthlyFils).toBe(cover.monthlyFils);
    expect(b.items[0]!.href).toBe('/property/p-amwaj-apt-2br');
  });

  it('new job: card upgrade from card eligibility, then a car', () => {
    const b = buildLifeEventBundle('new-job', 'conventional', FATIMA, NOW);
    expect(b.items.map((i) => i.kind)).toEqual(['card', 'vehicle']);
    const card = b.items[0]!;
    // Salary BHD 1,400: World (min 1,200) qualifies, World Elite (min 2,500) does not.
    expect(card.cardId).toBe('imtiaz-world');
    expect(card.href).toBe('/cards/imtiaz-world/apply');
    expect(card.cardLimitFils).toBeGreaterThan(0);
    expect(card.countsTowardDbr).toBe(false);
    expect(suggestCardUpgrade({ monthlySalaryFils: bhd(3_000), existingObligationsFils: 0 }, NOW)?.card.id).toBe('imtiaz-world-elite');
    // No DBR headroom: no credit card to suggest, only the car.
    expect(buildLifeEventBundle('new-job', 'conventional', { monthlySalaryFils: bhd(1_000), existingObligationsFils: bhd(600) }, NOW).items.map((i) => i.kind)).toEqual(['vehicle']);
  });

  it('new baby: the cheapest car with at least 7 seats, plus life cover', () => {
    const b = buildLifeEventBundle('new-baby', 'conventional', FATIMA, NOW);
    const car = familyCar()!;
    expect(car.seats).toBeGreaterThanOrEqual(7);
    expect(car.id).toBe('v-haval-h9-2026');
    expect(b.items.map((i) => i.kind)).toEqual(['vehicle', 'life-cover']);
    expect(b.items[0]!.href).toBe(`/cars/${car.id}`);
  });
});
