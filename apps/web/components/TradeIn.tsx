'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { financeLimits, formatBhd, NUMBER_LOCALE, type TradeInApplication, type TradeInCondition, type TradeInOffer, type TradeInRules, type TradeInStep } from '@sahel/domain';
import { t, type AppLocale, type MessageKey } from '@sahel/i18n';
import { useAcceptedBid, useTradeInChoice } from './ApplyFinance';
import { FinanceCalculator } from './FinanceCalculator';

type Tr = (k: MessageKey, v?: Record<string, string | number>) => string;

export const TRADE_CONDITION_LABEL: Record<TradeInCondition, MessageKey> = {
  excellent: 'tradeConditionExcellent',
  good: 'tradeConditionGood',
  fair: 'tradeConditionFair',
  poor: 'tradeConditionPoor',
};

function helpers(locale: AppLocale) {
  const tr: Tr = (k, v) => t(locale, k, v);
  const money = (f: number, d: 0 | 3 = 0) => formatBhd(f, locale, { decimals: d });
  const num = (n: number) => new Intl.NumberFormat(NUMBER_LOCALE[locale]).format(n);
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'ar' ? 'ar-BH-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${iso}T00:00:00Z`),
    );
  return { tr, money, num, date };
}

function stepLabel(s: TradeInStep, offer: TradeInOffer, tr: Tr, num: (n: number) => string): string {
  const v = offer.valuation;
  switch (s.code) {
    case 'reference':
      return tr('tradeStepReference', { year: v.vehicle.year });
    case 'age':
      return tr('tradeStepAge', { years: v.ageYears });
    case 'mileage':
      return tr('tradeStepMileage', { km: num(v.vehicle.mileageKm) });
    case 'condition':
      return `${tr('tradeStepCondition')}: ${tr(TRADE_CONDITION_LABEL[v.vehicle.condition])}`;
    case 'accident':
      return tr('tradeStepAccident');
    case 'dealerMargin':
      return tr('tradeStepDealerMargin');
  }
}

interface ApiError {
  code?: string;
  suggestions?: string[];
}

function errorText(e: ApiError, rules: TradeInRules, tr: Tr, num: (n: number) => string): string {
  if ((e.code === 'UNKNOWN_MAKE' || e.code === 'UNKNOWN_MODEL') && e.suggestions?.length) return tr('tradeDidYouMean', { names: e.suggestions.join(', ') });
  if (e.code === 'YEAR_OUT_OF_RANGE') return tr('tradeErrorYear', { min: rules.minYear, max: rules.maxYear });
  if (e.code === 'MILEAGE_OUT_OF_RANGE') return tr('tradeErrorMileage', { max: num(rules.maxMileageKm) });
  if (e.code === 'INVALID_PLATE') return tr('tradeErrorPlate');
  return tr('tradeErrorGeneric');
}

const field = 'w-full rounded-lg border border-border bg-surface p-2';

/**
 * Instant trade-in valuation (⚠️ sandbox rules model, not AI) via POST /api/v1/trade-in/valuations, the endpoint the
 * Flutter app calls too. Makes, years and limits come from the rules (same as GET /config `tradeIn`).
 */
export function TradeInForm({
  locale,
  rules,
  initialOffer,
  initialGarageId,
}: {
  locale: AppLocale;
  rules: TradeInRules;
  initialOffer: TradeInOffer | null;
  initialGarageId?: string;
}) {
  const { tr, money, num, date } = helpers(locale);
  const garageStart = rules.garage.find((g) => g.garageVehicleId === initialGarageId) ?? (initialGarageId !== undefined ? rules.garage[0] : undefined);
  const firstMake = rules.makes[0]!;
  const [garageId, setGarageId] = useState<string>(garageStart?.garageVehicleId ?? '');
  const [make, setMake] = useState(garageStart?.make ?? firstMake.make);
  const [model, setModel] = useState(garageStart?.model ?? firstMake.models[0]!.model);
  const [year, setYear] = useState(garageStart?.year ?? rules.maxYear - 3);
  const [mileage, setMileage] = useState(String(garageStart?.mileageKm ?? 50_000));
  const [condition, setCondition] = useState<TradeInCondition>('good');
  const [accident, setAccident] = useState(false);
  const [plate, setPlate] = useState('');
  const [offer, setOffer] = useState<TradeInOffer | null>(initialOffer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withdrawn, setWithdrawn] = useState(false);

  const garage = rules.garage.find((g) => g.garageVehicleId === garageId);
  const models = rules.makes.find((m) => m.make === make)?.models ?? [];
  const firstYear = models.find((m) => m.model === model)?.firstYear ?? rules.minYear;
  const years: number[] = [];
  for (let y = rules.maxYear; y >= firstYear; y--) years.push(y);

  const pickGarage = (id: string) => {
    setGarageId(id);
    const g = rules.garage.find((x) => x.garageVehicleId === id);
    if (g) {
      setMake(g.make);
      setModel(g.model);
      setYear(g.year);
      setMileage(String(g.mileageKm));
    }
  };
  const pickMake = (m: string) => {
    setMake(m);
    setModel(rules.makes.find((x) => x.make === m)?.models[0]?.model ?? '');
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setWithdrawn(false);
    const mileageKm = Number(mileage.replace(/[,\s]/g, ''));
    const body = garage
      ? { garageVehicleId: garage.garageVehicleId, mileageKm, condition, accidentHistory: accident }
      : { make, model, year, mileageKm, condition, accidentHistory: accident, ...(plate.trim() ? { plate: plate.trim() } : {}) };
    try {
      const res = await fetch('/api/v1/trade-in/valuations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = (await res.json()) as { data?: TradeInOffer; error?: ApiError };
      if (!res.ok || !json.data) throw json.error ?? {};
      setOffer(json.data);
    } catch (err) {
      setError(errorText((err ?? {}) as ApiError, rules, tr, num));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    setBusy(true);
    try {
      const res = await fetch('/api/v1/me/trade-in', { method: 'DELETE' });
      if (!res.ok) throw new Error(String(res.status));
      setOffer(null);
      setWithdrawn(true);
    } catch {
      setError(tr('errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form className="card space-y-4 p-5" onSubmit={submit} data-testid="tradein-form" noValidate>
        {rules.garage.length > 0 && (
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">{tr('tradeFromGarage')}</span>
            <select className={field} value={garageId} onChange={(e) => pickGarage(e.target.value)} data-testid="tradein-garage">
              {rules.garage.map((g) => (
                <option key={g.garageVehicleId} value={g.garageVehicleId}>
                  {tr('tradeGarageOption', { title: g.title, plate: g.plateMasked })}
                </option>
              ))}
              <option value="">{tr('tradeOtherCar')}</option>
            </select>
          </label>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{tr('tradeMake')}</span>
            <select className={field} value={make} onChange={(e) => pickMake(e.target.value)} disabled={!!garage} data-testid="tradein-make">
              {rules.makes.map((m) => (
                <option key={m.make} value={m.make}>{m.make}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{tr('tradeModel')}</span>
            <select className={field} value={model} onChange={(e) => setModel(e.target.value)} disabled={!!garage} data-testid="tradein-model">
              {models.map((m) => (
                <option key={m.model} value={m.model}>{m.model}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{tr('tradeYear')}</span>
            <select className={field} value={year} onChange={(e) => setYear(Number(e.target.value))} disabled={!!garage} data-testid="tradein-year">
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{tr('tradeMileage')}</span>
            <input className={field} inputMode="numeric" value={mileage} onChange={(e) => setMileage(e.target.value)} dir="ltr" data-testid="tradein-mileage" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{tr('tradePlate')}</span>
            {garage ? (
              <input className={field} value={garage.plateMasked} readOnly dir="ltr" data-testid="tradein-plate-masked" />
            ) : (
              <input className={field} inputMode="numeric" value={plate} onChange={(e) => setPlate(e.target.value)} maxLength={8} dir="ltr" autoComplete="off" data-testid="tradein-plate" />
            )}
            <span className="mt-1 block text-xs text-text-muted">{tr('tradePlateHint')}</span>
          </label>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{tr('tradeCondition')}</legend>
          <div className="flex flex-wrap gap-2 text-sm">
            {rules.conditions.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={condition === c}
                className={`rounded-full border px-3 py-1 ${condition === c ? 'border-brand bg-brand text-white' : 'border-border'}`}
                onClick={() => setCondition(c)}
                data-testid={`tradein-condition-${c}`}
              >
                {tr(TRADE_CONDITION_LABEL[c])}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={accident} onChange={(e) => setAccident(e.target.checked)} data-testid="tradein-accident" />
          {tr('tradeAccident')}
        </label>
        {error && <p className="text-sm text-danger" role="alert" data-testid="tradein-error">{error}</p>}
        <button type="submit" className="btn btn-primary w-full" disabled={busy} data-testid="tradein-submit">
          {tr(busy ? 'tradeValuing' : 'tradeSubmit')}
        </button>
      </form>

      <div className="space-y-4" aria-live="polite">
        {withdrawn && <p className="card p-4 text-sm" data-testid="tradein-withdrawn">{tr('tradeWithdrawn')}</p>}
        {offer && (
          <section className="card p-5" data-testid="tradein-result" aria-labelledby="tradein-offer-title">
            <p className="text-sm text-text-muted" data-testid="tradein-vehicle">
              {tr('tradeVehicleLine', { year: offer.valuation.vehicle.year, make: offer.valuation.vehicle.make, model: offer.valuation.vehicle.model, km: num(offer.valuation.vehicle.mileageKm) })}
              {offer.valuation.vehicle.plateMasked && <span dir="ltr"> · #{offer.valuation.vehicle.plateMasked}</span>}
            </p>
            <h2 id="tradein-offer-title" className="mt-3 text-sm font-semibold">{tr('tradeOffer')}</h2>
            <p className="text-3xl font-bold text-brand" data-testid="tradein-offer">{money(offer.offerFils)}</p>
            <p className="text-sm text-text-muted" data-testid="tradein-valid">{tr('tradeOfferValid', { date: date(offer.validUntil) })}</p>
            <p className="mt-3 text-sm">
              <span className="font-semibold">{tr('tradeRange')}: </span>
              <span data-testid="tradein-range">{tr('tradeRangeValue', { low: money(offer.valuation.rangeLowFils), high: money(offer.valuation.rangeHighFils) })}</span>
            </p>
            <h3 className="mt-4 text-sm font-semibold">{tr('tradeBreakdown')}</h3>
            <dl className="mt-2 space-y-1 text-sm" data-testid="tradein-breakdown">
              {offer.valuation.breakdown.map((s) => (
                <div key={s.code} className="flex items-baseline justify-between gap-3">
                  <dt className="text-text-muted">{stepLabel(s, offer, tr, num)}</dt>
                  <dd className="whitespace-nowrap font-semibold" dir="ltr">
                    {s.code === 'reference' ? money(s.amountFils) : `${s.amountFils < 0 ? '−' : '+'}${money(Math.abs(s.amountFils))}`}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link className="btn btn-primary" href={`/${locale}/cars`} data-testid="tradein-choose-car">{tr('tradeUseOnCar')}</Link>
              <button type="button" className="btn btn-ghost" onClick={withdraw} disabled={busy} data-testid="tradein-withdraw">{tr('tradeWithdraw')}</button>
            </div>
            <p className="mt-3 text-xs text-text-muted">{tr('tradeCreditNote')}</p>
          </section>
        )}
      </div>
    </div>
  );
}

/**
 * The car page's finance calculator, with "Use my trade-in (BHD X)" when the session customer has an active offer.
 * Using it restarts the calculator from the down payment GET /api/v1/me/trade-in?vehicleId= returns:
 * min(offer, maximum down payment), and "Apply for finance" then sends `useTradeIn: true`, so the server records the
 * credit on the application. With an accepted bid (car page link from "Bid For Me") the calculator prices the bid's
 * discounted price. ⚠️ Sandbox: credited at delivery.
 */
export function TradeInFinance({ locale, vehicleId, assetPriceFils }: { locale: AppLocale; vehicleId: string; assetPriceFils: number }) {
  const { tr, money } = helpers(locale);
  const [use, setUse] = useState<TradeInApplication | null>(null);
  const [applied, setApplied] = useState(false);
  const bid = useAcceptedBid();
  const { setUseTradeIn } = useTradeInChoice();
  // The price actually financed: the accepted bid's, else the list price.
  const priceFils = bid?.priceFils ?? assetPriceFils;
  const limits = financeLimits('vehicle', priceFils);
  const startDown = use ? Math.min(use.downPaymentFils, Math.floor(limits.maxDownPaymentFils / limits.downPaymentStepFils) * limits.downPaymentStepFils) : 0;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/me/trade-in?vehicleId=${encodeURIComponent(vehicleId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ data: { forVehicle: TradeInApplication | null } }>) : null))
      .then((j) => {
        if (cancelled) return;
        setUse(j?.data.forVehicle ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [vehicleId]);

  return (
    <div className="space-y-3">
      {/* Nothing without an active offer (the cars page and My Garage link to the trade-in page). */}
      {use && (
        <section className="card p-4" data-testid="tradein-use">
          {applied ? (
            <p className="text-sm font-semibold text-success" data-testid="tradein-applied">{tr('tradeApplied', { amount: money(use.downPaymentFils) })}</p>
          ) : (
            <button type="button" className="btn btn-primary w-full" onClick={() => { setApplied(true); setUseTradeIn?.(true); }} data-testid="tradein-use-button">
              {tr('tradeUseMine', { amount: money(use.offerFils) })}
            </button>
          )}
          {applied && use.capped && <p className="mt-1 text-xs text-text-muted">{tr('tradeCapped', { amount: money(use.creditedFils) })}</p>}
          {applied && use.cashTopUpFils > 0 && <p className="mt-1 text-xs text-text-muted">{tr('tradeTopUp', { amount: money(use.cashTopUpFils) })}</p>}
          <p className="mt-2 text-xs text-text-muted">{tr('tradeCreditNote')}</p>
        </section>
      )}
      <FinanceCalculator
        key={`${applied && use ? 'trade-in' : 'listing'}-${priceFils}`}
        locale={locale}
        productLine="vehicle"
        assetPriceFils={priceFils}
        initialDownPaymentFils={applied && use ? startDown : undefined}
      />
    </div>
  );
}
