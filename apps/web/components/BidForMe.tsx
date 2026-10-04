'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  formatBhd,
  NUMBER_LOCALE,
  type BidCondition,
  type BidInsurancePreference,
  type BidRequestView,
  type BidRules,
  type BidSort,
  type BidStructure,
  type BodyType,
  type CustomerBidView,
  type FuelType,
  type InstantMatch,
} from '@sahel/domain';
import { t, type AppLocale, type MessageKey } from '@sahel/i18n';
import {
  bahrainDateTimeText,
  BID_BODY_LABEL,
  BID_CONDITION_LABEL,
  BID_ERROR_LABEL,
  BID_EXTRA_LABEL,
  BID_FUEL_LABEL,
  BID_INSURANCE_LABEL,
  BID_REQUEST_STATUS_LABEL,
  BID_SORT_LABEL,
  BID_STATUS_LABEL,
} from '@/lib/bids-labels';
import { STRUCTURE_LABEL } from '@/lib/labels';

type Tr = (k: MessageKey, v?: Record<string, string | number>) => string;

function helpers(locale: AppLocale) {
  const tr: Tr = (k, v) => t(locale, k, v);
  const money = (f: number, d: 0 | 3 = 3) => formatBhd(f, locale, { decimals: d });
  const num = (n: number) => new Intl.NumberFormat(NUMBER_LOCALE[locale]).format(n);
  return { tr, money, num };
}

const field = 'w-full rounded-lg border border-border bg-surface p-2';

async function apiCall<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const json = (await res.json()) as { data?: T; error?: { code?: string } };
  if (!res.ok || json.data === undefined) throw json.error ?? {};
  return json.data;
}

/**
 * "Bid For Me" request form (POST /api/v1/requests, the endpoint the Flutter app calls too). Options and limits come
 * from the rules (GET /config `bids`); the server checks the maximum monthly against the customer's DBR headroom.
 */
export function BidRequestForm({ locale, rules }: { locale: AppLocale; rules: BidRules }) {
  const { tr, money, num } = helpers(locale);
  const router = useRouter();
  const [bodyType, setBodyType] = useState<BodyType | 'any'>('any');
  const [condition, setCondition] = useState<BidCondition>('any');
  const [minYear, setMinYear] = useState('');
  const [maxMileageKm, setMaxMileageKm] = useState('');
  const [fuel, setFuel] = useState<FuelType | 'any'>('any');
  const [minSeats, setMinSeats] = useState('');
  const [monthlyBhd, setMonthlyBhd] = useState(String(rules.defaultMonthlyFils / 1000));
  const [structure, setStructure] = useState<BidStructure>('murabaha');
  const [tenureMonths, setTenureMonths] = useState(rules.defaultTenureMonths);
  const [downBhd, setDownBhd] = useState('2000');
  const [useTradeIn, setUseTradeIn] = useState(rules.tradeIn !== null);
  const [insurance, setInsurance] = useState<BidInsurancePreference>('takaful');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const years: number[] = [];
  for (let y = rules.maxYear; y >= rules.minYear; y--) years.push(y);
  const tenures: number[] = [];
  for (let m = rules.minTenureMonths; m <= rules.maxTenureMonths; m += rules.tenureStepMonths) tenures.push(m);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      bodyType,
      condition,
      minYear: minYear ? Number(minYear) : null,
      maxMileageKm: maxMileageKm ? Number(maxMileageKm) : null,
      fuel,
      minSeats: minSeats ? Number(minSeats) : null,
      maxMonthlyFils: Math.round(Number(monthlyBhd) * 1000),
      structure,
      tenureMonths,
      downPaymentFils: Math.round(Number(downBhd || '0') * 1000),
      useTradeIn: useTradeIn && rules.tradeIn !== null,
      insurance,
    };
    try {
      const r = await apiCall<BidRequestView>('/api/v1/requests', { method: 'POST', body: JSON.stringify(body) });
      router.push(`/${locale}/requests/${r.id}`);
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setError(tr(BID_ERROR_LABEL[code] ?? 'errorGeneric'));
      setBusy(false);
    }
  }

  const label = 'mb-1 block text-sm font-medium';
  return (
    <form onSubmit={submit} className="space-y-5" data-testid="bid-request-form">
      <fieldset className="card grid gap-4 p-5 sm:grid-cols-2">
        <legend className="px-1 text-lg font-bold">{tr('bidSectionCar')}</legend>
        <label>
          <span className={label}>{tr('bidBodyType')}</span>
          <select className={field} value={bodyType} onChange={(e) => setBodyType(e.target.value as BodyType | 'any')} data-testid="bid-body">
            {(['any', ...rules.bodyTypes] as const).map((b) => (
              <option key={b} value={b}>{tr(BID_BODY_LABEL[b])}</option>
            ))}
          </select>
        </label>
        <label>
          <span className={label}>{tr('bidCondition')}</span>
          <select className={field} value={condition} onChange={(e) => setCondition(e.target.value as BidCondition)} data-testid="bid-condition">
            {rules.conditions.map((c) => (
              <option key={c} value={c}>{tr(BID_CONDITION_LABEL[c])}</option>
            ))}
          </select>
        </label>
        <label>
          <span className={label}>{tr('bidMinYear')}</span>
          <select className={field} value={minYear} onChange={(e) => setMinYear(e.target.value)} data-testid="bid-min-year">
            <option value="">{tr('bidAny')}</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <label>
          <span className={label}>{tr('bidMaxMileage')}</span>
          <select className={field} value={maxMileageKm} onChange={(e) => setMaxMileageKm(e.target.value)} data-testid="bid-max-mileage">
            <option value="">{tr('bidAny')}</option>
            {rules.mileageOptionsKm.map((km) => (
              <option key={km} value={km}>{tr('km', { value: num(km) })}</option>
            ))}
          </select>
        </label>
        <label>
          <span className={label}>{tr('bidFuel')}</span>
          <select className={field} value={fuel} onChange={(e) => setFuel(e.target.value as FuelType | 'any')} data-testid="bid-fuel">
            {(['any', ...rules.fuels] as const).map((f) => (
              <option key={f} value={f}>{tr(BID_FUEL_LABEL[f])}</option>
            ))}
          </select>
        </label>
        <label>
          <span className={label}>{tr('bidSeats')}</span>
          <select className={field} value={minSeats} onChange={(e) => setMinSeats(e.target.value)} data-testid="bid-seats">
            <option value="">{tr('bidAny')}</option>
            {rules.seatOptions.map((s) => (
              <option key={s} value={s}>{tr('bidSeatsAtLeast', { value: s })}</option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset className="card grid gap-4 p-5 sm:grid-cols-2">
        <legend className="px-1 text-lg font-bold">{tr('bidSectionFinance')}</legend>
        <label className="sm:col-span-2">
          <span className={label}>{tr('bidMaxMonthly')} (BHD)</span>
          <input
            className={field}
            type="number"
            inputMode="numeric"
            min={rules.minMonthlyFils / 1000}
            step={rules.monthlyStepFils / 1000}
            value={monthlyBhd}
            onChange={(e) => setMonthlyBhd(e.target.value)}
            data-testid="bid-max-monthly"
            required
          />
          <span className="mt-1 block text-xs text-text-muted" data-testid="bid-max-monthly-hint">
            {tr('bidMaxMonthlyHint', { amount: money(rules.maxMonthlyFils, 0) })}
          </span>
        </label>
        <div className="sm:col-span-2">
          <span className={label}>{tr('bidStructure')}</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={tr('bidStructure')}>
            {rules.structures.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={structure === s}
                className={`btn ${structure === s ? (s === 'murabaha' ? 'bg-islamic text-white' : 'btn-primary') : 'btn-ghost'}`}
                onClick={() => setStructure(s)}
                data-testid={`bid-structure-${s}`}
              >
                {tr(STRUCTURE_LABEL[s])}
              </button>
            ))}
          </div>
        </div>
        <label>
          <span className={label}>{tr('tenure')}</span>
          <select className={field} value={tenureMonths} onChange={(e) => setTenureMonths(Number(e.target.value))} data-testid="bid-tenure">
            {tenures.map((m) => (
              <option key={m} value={m}>{tr('months', { value: m })}</option>
            ))}
          </select>
        </label>
        <label>
          <span className={label}>{tr('bidDownPayment')} (BHD)</span>
          <input
            className={field}
            type="number"
            inputMode="numeric"
            min={0}
            max={rules.maxCashDownPaymentFils / 1000}
            step={rules.downPaymentStepFils / 1000}
            value={downBhd}
            onChange={(e) => setDownBhd(e.target.value)}
            data-testid="bid-down-payment"
          />
        </label>
        {rules.tradeIn && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={useTradeIn} onChange={(e) => setUseTradeIn(e.target.checked)} data-testid="bid-use-trade-in" />
            {tr('bidUseTradeIn', { amount: money(rules.tradeIn.offerFils, 0) })}
          </label>
        )}
        <label className="sm:col-span-2">
          <span className={label}>{tr('bidInsurance')}</span>
          <select className={field} value={insurance} onChange={(e) => setInsurance(e.target.value as BidInsurancePreference)} data-testid="bid-insurance">
            {rules.insurancePreferences.map((p) => (
              <option key={p} value={p}>{tr(BID_INSURANCE_LABEL[p])}</option>
            ))}
          </select>
        </label>
      </fieldset>

      {error && (
        <p className="text-sm text-danger" role="alert" data-testid="bid-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={busy} data-testid="bid-post">
          {tr('bidPost')}
        </button>
        <span className="text-sm text-text-muted">{tr('bidValidity', { hours: rules.validityHours })}</span>
      </div>
    </form>
  );
}

function StatusPill({ status, tr }: { status: BidRequestView['status']; tr: Tr }) {
  const tone =
    status === 'OPEN' ? 'bg-brand-soft text-brand' : status === 'CLOSED' ? 'bg-islamic-soft text-islamic' : 'bg-background text-text-muted';
  return (
    <span className={`rounded-full px-3 py-1 text-sm font-semibold ${tone}`} data-testid="request-status" data-status={status}>
      {tr(BID_REQUEST_STATUS_LABEL[status])}
    </span>
  );
}

function OfferFigures({ pricing, locale }: { pricing: InstantMatch['pricing']; locale: AppLocale }) {
  const { tr, money } = helpers(locale);
  return (
    <div className="text-sm">
      <p className="text-xl font-bold text-brand" data-testid="offer-monthly" data-fils={pricing.monthlyFils}>
        {tr('bidMonthly', { amount: money(pricing.monthlyFils) })}
      </p>
      <p className="text-text-muted">
        {pricing.discountFils > 0 && (
          <>
            <span className="line-through">{money(pricing.listPriceFils, 0)}</span>{' '}
          </>
        )}
        {tr('bidNetPrice', { amount: money(pricing.priceFils, 0) })} · {tr('bidDownPaymentValue', { amount: money(pricing.downPaymentFils, 0) })}
      </p>
      <p className="text-text-muted" data-testid="offer-total" data-fils={pricing.totalCostFils}>
        {tr('bidTotalCost', { amount: money(pricing.totalCostFils, 0) })}
      </p>
      {pricing.insurance && (
        <p className="text-xs text-text-muted">
          🛡️ {tr('bidInsuranceEstimate', { insurer: pricing.insurance.insurerName[locale], amount: money(pricing.insurance.annualPremiumFils, 0) })}
        </p>
      )}
    </div>
  );
}

/**
 * The customer's bids board: instant matches, dealer bids ranked by monthly, total cost or extras, accept and cancel.
 * Polls GET /api/v1/requests/{id} every `pollSeconds` while the request is open (⚠️ sandbox: no push yet).
 */
export function BidBoard({ locale, initial }: { locale: AppLocale; initial: BidRequestView }) {
  const { tr, money, num } = helpers(locale);
  const [view, setView] = useState(initial);
  const [sort, setSort] = useState<BidSort>(initial.sort);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const refresh = useCallback(
    async (s: BidSort) => {
      try {
        setView(await apiCall<BidRequestView>(`/api/v1/requests/${initial.id}?sort=${s}`, { cache: 'no-store' }));
      } catch {
        // Keep the last board; the next poll retries.
      }
    },
    [initial.id],
  );

  useEffect(() => {
    if (view.status !== 'OPEN') return;
    const timer = setInterval(() => void refresh(sort), view.pollSeconds * 1000);
    return () => clearInterval(timer);
  }, [view.status, view.pollSeconds, sort, refresh]);

  async function act(path: string, body: object) {
    setBusy(true);
    setError(false);
    try {
      setView(await apiCall<BidRequestView>(`/api/v1/requests/${view.id}/${path}`, { method: 'POST', body: JSON.stringify(body) }));
    } catch {
      setError(true);
      void refresh(sort);
    } finally {
      setBusy(false);
    }
  }

  const c = view.criteria;
  const chips = [
    tr(BID_BODY_LABEL[c.bodyType]),
    tr(BID_CONDITION_LABEL[c.condition]),
    ...(c.minYear !== null ? [`${tr('bidMinYear')} ${c.minYear}`] : []),
    ...(c.maxMileageKm !== null ? [`${tr('bidMaxMileage')} ${tr('km', { value: num(c.maxMileageKm) })}`] : []),
    ...(c.fuel !== 'any' ? [tr(BID_FUEL_LABEL[c.fuel])] : []),
    ...(c.minSeats !== null ? [tr('bidSeatsAtLeast', { value: c.minSeats })] : []),
    tr(STRUCTURE_LABEL[view.terms.structure]),
    tr('months', { value: view.terms.tenureMonths }),
    tr('bidDownPaymentValue', { amount: money(view.terms.downPaymentFils, 0) }) +
      (view.terms.tradeIn ? ` (${tr('bidTradeInIncluded', { amount: money(view.terms.tradeIn.offerFils, 0) })})` : ''),
    tr(BID_INSURANCE_LABEL[view.terms.insurance]),
  ];
  const acceptedBid = view.accepted ? view.bids.find((b) => b.id === view.accepted!.bidId) : undefined;

  return (
    <div className="space-y-6" data-testid="bid-board" data-request-id={view.id}>
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{tr('bidRequestTitle')}</h1>
          <p className="text-lg font-semibold text-brand" data-testid="request-max-monthly">
            {tr('bidSummaryMonthly', { amount: money(view.terms.maxMonthlyFils, 0) })}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1 text-xs">
            {chips.map((x) => (
              <li key={x} className="rounded-full bg-background px-2 py-0.5">{x}</li>
            ))}
          </ul>
          {view.status === 'OPEN' && (
            <p className="mt-2 text-sm text-text-muted" data-testid="request-expires">
              {tr('bidExpiresAt', { time: bahrainDateTimeText(locale, view.expiresAt) })} · {tr('bidLiveRefresh', { seconds: view.pollSeconds })}
            </p>
          )}
        </div>
        <StatusPill status={view.status} tr={tr} />
      </header>

      {view.accepted && acceptedBid && (
        <section className="card border-islamic p-5" data-testid="bid-accepted" aria-labelledby="accepted-title">
          <h2 id="accepted-title" className="text-lg font-bold text-islamic">
            ✓ {tr('bidAcceptedTitle', { dealer: acceptedBid.seller.name[locale] })}
          </h2>
          <p className="font-semibold">{acceptedBid.vehicle.title}</p>
          <p className="text-sm">{tr('bidAcceptedBody')}</p>
          <Link href={`/${locale}${view.accepted.applyHref}`} className="btn btn-primary mt-3" data-testid="bid-apply-link">
            {tr('bidApplyCta')} <span aria-hidden className="inline-block rtl:rotate-180">→</span>
          </Link>
        </section>
      )}

      <section aria-labelledby="bids-title">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 id="bids-title" className="me-auto text-xl font-bold">
            {tr('bidBidsTitle')} <span className="text-base font-normal text-text-muted">({num(view.bidCount)})</span>
          </h2>
          <label className="flex items-center gap-2 text-sm">
            {tr('bidSortBy')}
            <select
              className="rounded-lg border border-border bg-surface p-1"
              value={sort}
              onChange={(e) => {
                const s = e.target.value as BidSort;
                setSort(s);
                void refresh(s);
              }}
              data-testid="bid-sort"
            >
              {(Object.keys(BID_SORT_LABEL) as BidSort[]).map((s) => (
                <option key={s} value={s}>{tr(BID_SORT_LABEL[s])}</option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="mb-2 text-sm text-danger" role="alert">{tr('errorGeneric')}</p>}
        {view.bids.length === 0 ? (
          <p className="card p-5 text-sm text-text-muted" data-testid="bids-empty">{tr('bidBidsEmpty')}</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {view.bids.map((b) => (
              <BidCard key={b.id} bid={b} locale={locale} canAccept={view.canAccept} busy={busy} onAccept={() => act('accept', { bidId: b.id })} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="instant-title">
        <h2 id="instant-title" className="text-xl font-bold">{tr('bidInstantTitle')}</h2>
        <p className="mb-3 text-sm text-text-muted">{tr('bidInstantSubtitle')}</p>
        {view.instantMatches.length === 0 ? (
          <p className="card p-5 text-sm text-text-muted" data-testid="instant-empty">{tr('bidInstantEmpty')}</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {view.instantMatches.map((m) => (
              <li key={m.vehicle.id} className="card space-y-2 p-4" data-testid="instant-match" data-vehicle-id={m.vehicle.id}>
                <p className="font-semibold">{m.vehicle.title}</p>
                <p className="text-xs text-text-muted">{m.seller.name[locale]}</p>
                <OfferFigures pricing={m.pricing} locale={locale} />
                <Link href={`/${locale}${m.href}`} className="text-sm font-semibold text-brand">
                  {tr('bidViewCar')} <span aria-hidden className="inline-block rtl:rotate-180">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {view.canCancel && (
        <button type="button" className="btn btn-ghost text-danger" disabled={busy} onClick={() => act('cancel', {})} data-testid="bid-cancel">
          {tr('bidCancel')}
        </button>
      )}
      <p className="text-xs text-text-muted">⚠️ {tr('bidSandboxNote')}</p>
    </div>
  );
}

function BidCard({ bid, locale, canAccept, busy, onAccept }: { bid: CustomerBidView; locale: AppLocale; canAccept: boolean; busy: boolean; onAccept: () => void }) {
  const { tr, money } = helpers(locale);
  const lost = bid.status === 'LOST';
  return (
    <li
      className={`card space-y-2 p-4 ${bid.status === 'ACCEPTED' ? 'border-islamic' : ''} ${lost ? 'opacity-60' : ''}`}
      data-testid="bid"
      data-bid-id={bid.id}
      data-seller-id={bid.sellerId}
      data-status={bid.status}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{bid.vehicle.title}</p>
          <p className="text-xs text-text-muted">{bid.seller.name[locale]}</p>
        </div>
        {bid.rank !== null && bid.status === 'ACTIVE' && (
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">{tr('bidRank', { rank: bid.rank })}</span>
        )}
        {bid.status !== 'ACTIVE' && <span className="rounded-full bg-background px-2 py-0.5 text-xs">{tr(BID_STATUS_LABEL[bid.status])}</span>}
      </div>
      <OfferFigures pricing={bid.pricing} locale={locale} />
      {bid.pricing.discountFils > 0 && (
        <p className="text-sm font-semibold text-islamic" data-testid="bid-discount">{tr('bidDiscount', { amount: money(bid.pricing.discountFils, 0) })}</p>
      )}
      {bid.extras.length > 0 && (
        <ul className="flex flex-wrap gap-1 text-xs" aria-label={tr('bidExtras')}>
          {bid.extras.map((x) => (
            <li key={x} className="rounded-full bg-islamic-soft px-2 py-0.5 text-islamic">{tr(BID_EXTRA_LABEL[x])}</li>
          ))}
        </ul>
      )}
      {canAccept && bid.status === 'ACTIVE' && (
        <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={onAccept} data-testid="bid-accept">
          {tr('bidAccept')}
        </button>
      )}
    </li>
  );
}
