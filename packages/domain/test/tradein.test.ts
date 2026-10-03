import { describe, expect, it } from 'vitest';
import {
  bhd,
  demoCustomer,
  financeLimits,
  maskPlate,
  SandboxTradeInStore,
  suggestNames,
  TRADE_IN_CONDITIONS,
  TRADE_IN_MAX_MILEAGE_KM,
  TRADE_IN_REFERENCE,
  TRADE_IN_ROUNDING_FILS,
  tradeInDownPayment,
  tradeInRules,
  TradeInError,
  valueTradeIn,
  VEHICLES,
  type TradeInRequest,
} from '../src';

// 2026-10-03 22:30 UTC is already 2026-10-04 in Bahrain (UTC+3).
const NOW = new Date(Date.UTC(2026, 9, 3, 22, 30));
const camry: TradeInRequest = { make: 'Toyota', model: 'Camry', year: 2021, mileageKm: 60_000, condition: 'good', accidentHistory: false };
const value = (over: Partial<TradeInRequest> = {}) => valueTradeIn({ ...camry, ...over }, [], NOW);

function err(fn: () => unknown): TradeInError | undefined {
  try {
    fn();
  } catch (e) {
    return e as TradeInError;
  }
  return undefined;
}

describe('trade-in valuation (⚠️ sandbox rules model)', () => {
  it('is deterministic, labelled as rules (not AI), and in integer fils', () => {
    const a = value();
    expect(value()).toEqual(a);
    expect(a.method).toBe('rules');
    expect(a.sandbox).toBe(true);
    for (const n of [a.valueFils, a.rangeLowFils, a.rangeHighFils, ...a.breakdown.map((s) => s.valueAfterFils)]) {
      expect(Number.isSafeInteger(n)).toBe(true);
    }
  });

  it('returns an ordered range on the BHD 100 grid around the value', () => {
    for (const condition of TRADE_IN_CONDITIONS) {
      const v = value({ condition });
      expect(v.rangeLowFils).toBeLessThan(v.rangeHighFils);
      expect(v.rangeLowFils).toBeLessThanOrEqual(v.valueFils);
      expect(v.rangeHighFils).toBeGreaterThanOrEqual(v.valueFils);
      expect(v.rangeLowFils % TRADE_IN_ROUNDING_FILS).toBe(0);
      expect(v.rangeHighFils % TRADE_IN_ROUNDING_FILS).toBe(0);
    }
  });

  it('breakdown starts at the reference price and ends at the value', () => {
    const v = value({ accidentHistory: true });
    expect(v.breakdown.map((s) => s.code)).toEqual(['reference', 'age', 'mileage', 'condition', 'accident', 'dealerMargin']);
    expect(v.breakdown.at(-1)!.valueAfterFils).toBe(v.valueFils);
    for (let i = 1; i < v.breakdown.length; i++) {
      expect(v.breakdown[i]!.valueAfterFils).toBe(v.breakdown[i - 1]!.valueAfterFils + v.breakdown[i]!.amountFils);
    }
    expect(value().breakdown.map((s) => s.code)).not.toContain('accident');
  });

  it('derives reference prices from the catalog new cars', () => {
    const crv = TRADE_IN_REFERENCE.find((m) => m.make === 'Honda' && m.model === 'CR-V')!;
    expect(crv.source).toBe('catalog');
    expect(crv.referencePriceFils).toBe(VEHICLES.find((v) => v.id === 'v-honda-crv-2026')!.priceFils);
    // Every model in the catalog can be valued.
    for (const v of VEHICLES) expect(TRADE_IN_REFERENCE.some((m) => m.make === v.make && m.model === v.model), `${v.make} ${v.model}`).toBe(true);
  });

  it('older cars are worth less', () => {
    let prev = Infinity;
    for (let year = 2027; year >= 2012; year--) {
      const v = value({ year }).valueFils;
      expect(v, String(year)).toBeLessThan(prev);
      prev = v;
    }
  });

  it('more km is worth less (until the mileage cap)', () => {
    let prev = Infinity;
    for (let km = 0; km <= 200_000; km += 10_000) {
      const v = value({ mileageKm: km }).valueFils;
      expect(v, String(km)).toBeLessThan(prev);
      prev = v;
    }
    expect(value({ mileageKm: TRADE_IN_MAX_MILEAGE_KM }).valueFils).toBeLessThanOrEqual(value({ mileageKm: 200_000 }).valueFils);
  });

  it('poor < fair < good < excellent, and an accident lowers the value', () => {
    const [ex, good, fair, poor] = (['excellent', 'good', 'fair', 'poor'] as const).map((condition) => value({ condition }));
    expect(poor!.valueFils).toBeLessThan(fair!.valueFils);
    expect(fair!.valueFils).toBeLessThan(good!.valueFils);
    expect(good!.valueFils).toBeLessThan(ex!.valueFils);
    expect(poor!.rangeLowFils).toBeLessThan(ex!.rangeLowFils);
    expect(value({ accidentHistory: true }).valueFils).toBeLessThan(value().valueFils);
  });

  it('matches make and model loosely, and suggests close names for unknown ones', () => {
    expect(value({ make: ' toyota ', model: 'CAMRY' }).vehicle).toMatchObject({ make: 'Toyota', model: 'Camry' });
    expect(value({ make: 'Toyota', model: 'land-cruiser', year: 2022 }).vehicle.model).toBe('Land Cruiser');

    const make = err(() => value({ make: 'Toyta' }));
    expect(make?.code).toBe('UNKNOWN_MAKE');
    expect(make?.suggestions).toContain('Toyota');
    expect(make?.message).toContain('Toyota');

    const model = err(() => value({ model: 'Camri' }));
    expect(model?.code).toBe('UNKNOWN_MODEL');
    expect(model?.suggestions).toEqual(['Camry']);

    // Nothing close: every option is suggested.
    expect(err(() => value({ make: 'Zzzzzz' }))?.suggestions.length).toBeGreaterThan(5);
    expect(suggestNames('Hav', ['HAVAL', 'Honda'])).toEqual(['HAVAL']);
  });

  it('enforces year, mileage, condition and request bounds', () => {
    expect(err(() => value({ year: 2010 }))?.code).toBe('YEAR_OUT_OF_RANGE'); // 15 years before 2026 is 2011
    expect(value({ year: 2011 }).ageYears).toBe(15);
    expect(err(() => value({ year: 2028 }))?.code).toBe('YEAR_OUT_OF_RANGE');
    expect(err(() => value({ make: 'Tesla', model: 'Model 3', year: 2017 }))?.code).toBe('YEAR_OUT_OF_RANGE'); // before it was sold here
    expect(err(() => value({ year: 2020.5 }))?.code).toBe('INVALID_REQUEST');
    expect(err(() => value({ mileageKm: -1 }))?.code).toBe('MILEAGE_OUT_OF_RANGE');
    expect(err(() => value({ mileageKm: TRADE_IN_MAX_MILEAGE_KM + 1 }))?.code).toBe('MILEAGE_OUT_OF_RANGE');
    expect(err(() => value({ mileageKm: 1.5 }))?.code).toBe('MILEAGE_OUT_OF_RANGE');
    expect(err(() => value({ condition: 'mint' }))?.code).toBe('INVALID_CONDITION');
    expect(err(() => value({ accidentHistory: 'no' as unknown as boolean }))?.code).toBe('INVALID_REQUEST');
    expect(err(() => value({ make: '' }))?.code).toBe('INVALID_REQUEST');
  });

  it('validates the plate and never returns it in full', () => {
    expect(value({ plate: '123 456' }).vehicle.plateMasked).toBe('****56');
    expect(JSON.stringify(value({ plate: '123456' }))).not.toContain('123456');
    expect(maskPlate('12')).toBe('**');
    expect(maskPlate('7')).toBe('*');
    for (const plate of ['1234567', 'AB123', '12-34']) expect(err(() => value({ plate }))?.code).toBe('INVALID_PLATE');
    expect(value({ plate: '' }).vehicle.plateMasked).toBeUndefined();
  });

  it('pre-fills from the customer garage (plate masked)', () => {
    const garage = demoCustomer(NOW).garage;
    const v = valueTradeIn({ garageVehicleId: 'v-honda-crv-2026', condition: 'excellent' }, garage, NOW);
    expect(v.vehicle).toMatchObject({ make: 'Honda', model: 'CR-V', year: 2026, mileageKm: 27_850, plateMasked: '****56', garageVehicleId: 'v-honda-crv-2026' });
    expect(valueTradeIn({ garageVehicleId: 'v-honda-crv-2026', condition: 'good', mileageKm: 40_000 }, garage, NOW).vehicle.mileageKm).toBe(40_000);
    expect(err(() => valueTradeIn({ garageVehicleId: 'v-tesla-model3-2024', condition: 'good' }, garage, NOW))?.code).toBe('GARAGE_VEHICLE_NOT_FOUND');

    const rules = tradeInRules(garage, NOW);
    expect(rules.garage).toEqual([
      { garageVehicleId: 'v-honda-crv-2026', title: 'Honda CR-V 2026', make: 'Honda', model: 'CR-V', year: 2026, mileageKm: 27_850, plateMasked: '****56' },
    ]);
    expect(JSON.stringify(rules)).not.toContain('123456');
    expect(rules).toMatchObject({ minYear: 2011, maxYear: 2027, maxMileageKm: TRADE_IN_MAX_MILEAGE_KM, offerValidityDays: 7, method: 'rules' });
  });
});

describe('trade-in offers', () => {
  it('offers the low end, valid through the 7th Bahrain day, per customer', () => {
    let now = NOW;
    const store = new SandboxTradeInStore(() => now);
    const offer = store.value('cus_a', camry);
    expect(offer.offerFils).toBe(offer.valuation.rangeLowFils);
    expect(offer.validUntil).toBe('2026-10-11'); // Bahrain date is already 2026-10-04
    expect(offer.expiresAt).toBe('2026-10-11T20:59:59.999Z');
    expect(store.active('cus_a')).toEqual(offer);
    expect(store.active('cus_b')).toBeUndefined();
    expect(store.withdraw('cus_b')).toBe(false);

    now = new Date(Date.parse(offer.expiresAt));
    expect(store.active('cus_a')).toEqual(offer);
    now = new Date(Date.parse(offer.expiresAt) + 1);
    expect(store.active('cus_a')).toBeUndefined();
  });

  it('a new valuation replaces the offer; withdrawing removes it', () => {
    const store = new SandboxTradeInStore(() => NOW);
    const first = store.value('cus_a', camry);
    const second = store.value('cus_a', { ...camry, condition: 'excellent' });
    expect(second.id).not.toBe(first.id);
    expect(store.active('cus_a')?.id).toBe(second.id);
    expect(store.withdraw('cus_a')).toBe(true);
    expect(store.active('cus_a')).toBeUndefined();
    expect(store.withdraw('cus_a')).toBe(false);
  });

  it('an invalid request leaves the current offer alone', () => {
    const store = new SandboxTradeInStore(() => NOW);
    const offer = store.value('cus_a', camry);
    expect(() => store.value('cus_a', { ...camry, make: 'Nope' })).toThrow(TradeInError);
    expect(store.active('cus_a')).toEqual(offer);
  });
});

describe('trade-in as down payment', () => {
  const crv = bhd(14_900);
  const limits = financeLimits('vehicle', crv);

  it('uses the offer as the down payment', () => {
    expect(tradeInDownPayment(bhd(5_000), 'v', crv)).toEqual({
      vehicleId: 'v',
      offerFils: bhd(5_000),
      downPaymentFils: bhd(5_000),
      creditedFils: bhd(5_000),
      capped: false,
      cashTopUpFils: 0,
    });
  });

  it('caps at the maximum down payment (on the slider step)', () => {
    const a = tradeInDownPayment(bhd(20_000), 'v', crv);
    expect(a.capped).toBe(true);
    expect(a.downPaymentFils).toBeLessThanOrEqual(limits.maxDownPaymentFils);
    expect(a.downPaymentFils).toBe(bhd(13_400)); // 90% of 14,900 = 13,410, down to the BHD 100 step
    expect(a.creditedFils).toBe(a.downPaymentFils);
  });

  it('never goes below the minimum down payment: the customer tops up in cash', () => {
    const a = tradeInDownPayment(bhd(800), 'v', crv);
    expect(a.downPaymentFils).toBe(bhd(1_500)); // 10% of 14,900 = 1,490, up to the step
    expect(a.cashTopUpFils).toBe(bhd(700));
    expect(a.creditedFils).toBe(bhd(800));
  });
});
