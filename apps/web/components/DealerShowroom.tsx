'use client';

import { useEffect, useState } from 'react';
import {
  financeLimits,
  formatBhd,
  LISTING_DEFAULTS,
  type DealerInventoryItem,
  type FinanceStructure,
  type SharedPreApproval,
  type ShowroomOffer,
} from '@sahel/domain';
import { t, type AppLocale, type MessageKey } from '@sahel/i18n';
import { QuoteColumn } from '@/components/FinanceCalculator';

const STEP = 100_000; // BHD 100

function defaultDown(priceFils: number) {
  const limits = financeLimits('vehicle', priceFils);
  return Math.max(Math.ceil(limits.minDownPaymentFils / STEP) * STEP, Math.round((priceFils * LISTING_DEFAULTS.vehicle.downPaymentPct) / 100 / STEP) * STEP);
}

/**
 * J7 on the showroom floor: redeem the customer's shared pre-approval code, then build an offer on a car
 * from this dealer's stock, Islamic and conventional side by side, checked against the shared limit.
 * Pricing runs server-side (POST /api/v1/dealer/offers) because the token must be re-checked each time.
 */
export function DealerShowroom({ locale, sellerId, inventory }: { locale: AppLocale; sellerId: string; inventory: DealerInventoryItem[] }) {
  const tr = (k: MessageKey, v?: Record<string, string | number>) => t(locale, k, v);
  const money = (f: number, d: 0 | 3 = 3) => formatBhd(f, locale, { decimals: d });
  const time = (iso: string) => new Intl.DateTimeFormat(locale === 'ar' ? 'ar-BH-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  const date = (iso: string) => new Intl.DateTimeFormat(locale === 'ar' ? 'ar-BH-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));

  const [tokenInput, setTokenInput] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [customer, setCustomer] = useState<SharedPreApproval | null>(null);
  const [redeemError, setRedeemError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  const first = inventory[0];
  const [vehicleId, setVehicleId] = useState(first?.id ?? '');
  const vehicle = inventory.find((v) => v.id === vehicleId) ?? first;
  const [down, setDown] = useState(() => (first ? defaultDown(first.priceFils) : 0));
  const [tenure, setTenure] = useState<number>(LISTING_DEFAULTS.vehicle.tenureMonths);
  const [selected, setSelected] = useState<FinanceStructure>('murabaha');
  const [offer, setOffer] = useState<ShowroomOffer | null>(null);
  const [offerError, setOfferError] = useState(false);

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setRedeemError(null);
    try {
      const res = await fetch('/api/v1/dealer/preapproval/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId, token: tokenInput }),
      });
      const body = (await res.json()) as { data?: SharedPreApproval; error?: { code: string } };
      if (!res.ok || !body.data) {
        setRedeemError(body.error?.code === 'TOKEN_EXPIRED' ? 'dealerTokenExpired' : body.error?.code === 'TOKEN_NOT_FOUND' ? 'dealerTokenNotFound' : 'errorGeneric');
        return;
      }
      setCustomer(body.data);
      setToken(tokenInput);
    } catch {
      setRedeemError('errorGeneric');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setCustomer(null);
    setToken(null);
    setOffer(null);
    setTokenInput('');
  }

  useEffect(() => {
    if (!token || !vehicle) return;
    const ctrl = new AbortController();
    setOfferError(false);
    fetch('/api/v1/dealer/offers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sellerId, token, vehicleId: vehicle.id, downPaymentFils: down, tenureMonths: tenure }),
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        setOffer(((await res.json()) as { data: ShowroomOffer }).data);
      })
      .catch((e: unknown) => {
        if ((e as Error).name !== 'AbortError') setOfferError(true);
      });
    return () => ctrl.abort();
  }, [sellerId, token, vehicle, down, tenure]);

  if (!customer) {
    return (
      <form onSubmit={redeem} className="card mx-auto max-w-lg p-5" data-testid="redeem-form">
        <label className="block">
          <span className="mb-1 block font-semibold">{tr('dealerTokenLabel')}</span>
          <input
            className="w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-3 text-center font-mono text-2xl uppercase tracking-widest"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder={tr('dealerTokenPlaceholder')}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            dir="ltr"
            data-testid="token-input"
          />
        </label>
        <p className="mt-2 text-xs text-text-muted">{tr('dealerScanNote')}</p>
        {redeemError && <p className="mt-2 text-sm text-danger" role="alert" data-testid="redeem-error">{tr(redeemError)}</p>}
        <button type="submit" className="btn btn-primary mt-4 w-full" disabled={busy || tokenInput.trim().length < 4} data-testid="redeem">
          {tr('dealerRedeem')}
        </button>
      </form>
    );
  }

  const limits = vehicle ? financeLimits('vehicle', vehicle.priceFils) : null;
  const minDown = limits ? Math.ceil(limits.minDownPaymentFils / STEP) * STEP : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <section className="space-y-4">
        <div className="overflow-hidden rounded-[var(--radius-lg)] bg-gradient-to-br from-brand-dark to-brand p-5 text-white" data-testid="customer-summary">
          <p className="text-xl font-bold">{tr('dealerCustomerPreApproved', { name: customer.firstName[locale] })}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/10 p-3">
              <p className="text-xs opacity-80">{tr('dealerVehicleLimit')}</p>
              <p className="text-lg font-bold" data-testid="vehicle-limit">{money(customer.vehicleLimitFils, 0)}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-3">
              <p className="text-xs opacity-80">{tr('dealerMaxMonthly')}</p>
              <p className="text-lg font-bold" data-testid="max-monthly">{money(customer.maxMonthlyFils)}</p>
            </div>
          </div>
          <p className="mt-3 text-xs opacity-80">{tr('dealerValidUntil', { date: date(customer.validUntil) })} · {tr('dealerTokenExpiresAt', { time: time(customer.tokenExpiresAt) })}</p>
        </div>
        <p className="text-xs text-text-muted">{tr('dealerSharedOnly')}</p>
        <button type="button" className="btn btn-ghost w-full" onClick={reset}>{tr('dealerNextCustomer')}</button>
      </section>

      {vehicle && limits && (
        <section className="card p-5" aria-labelledby="offer-title" data-testid="offer-builder">
          <h2 id="offer-title" className="mb-4 text-lg font-bold">{tr('dealerBuildOffer')}</h2>
          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-medium">{tr('dealerSelectVehicle')}</span>
            <select
              className="w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2"
              value={vehicle.id}
              onChange={(e) => {
                const v = inventory.find((x) => x.id === e.target.value);
                if (!v) return;
                setVehicleId(v.id);
                setDown(defaultDown(v.priceFils));
              }}
              data-testid="offer-vehicle"
            >
              {inventory.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} {v.year} · {money(v.priceFils, 0)}
                </option>
              ))}
            </select>
          </label>
          <label className="mb-4 block">
            <span className="flex justify-between text-sm font-medium">
              {tr('downPayment')} <output className="font-bold">{money(down, 0)}</output>
            </span>
            <input type="range" className="w-full" min={minDown} max={limits.maxDownPaymentFils} step={STEP} value={down} onChange={(e) => setDown(Number(e.target.value))} aria-label={tr('downPayment')} />
          </label>
          <label className="mb-5 block">
            <span className="flex justify-between text-sm font-medium">
              {tr('tenure')} <output className="font-bold">{tr('months', { value: tenure })}</output>
            </span>
            <input
              type="range"
              className="w-full"
              min={limits.minTenureMonths}
              max={limits.maxTenureMonths}
              step={12}
              value={tenure}
              onChange={(e) => setTenure(Number(e.target.value))}
              aria-label={tr('tenure')}
              data-testid="offer-tenure"
            />
          </label>

          {offerError && <p className="mb-2 text-sm text-danger" role="alert">{tr('errorGeneric')}</p>}
          {offer && offer.vehicle.id === vehicle.id && (
            <>
              <p className={`mb-2 text-sm font-semibold ${offer.withinLimit ? 'text-islamic' : 'text-danger'}`} data-testid="offer-status">
                {offer.withinLimit ? `✓ ${tr('dealerWithinLimit')}` : `✕ ${tr('dealerOverLimit')}`}
              </p>
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={tr('compareSideBySide')}>
                {offer.quotes.map((q) => (
                  <QuoteColumn key={q.structure} q={q} active={q.structure === selected} onSelect={() => setSelected(q.structure)} tr={tr} money={money}>
                    <p className={`mt-3 text-xs font-semibold ${q.withinLimit ? 'text-islamic' : 'text-danger'}`} data-testid={`within-${q.structure}`}>
                      {q.withinLimit ? `✓ ${tr('dealerWithinLimit')}` : `✕ ${tr('dealerOverLimit')}`}
                    </p>
                    {!q.withinFinanceLimit && <p className="text-xs text-danger">{tr('dealerOverFinance')}</p>}
                    {!q.withinMonthlyLimit && <p className="text-xs text-danger">{tr('dealerOverMonthly')}</p>}
                  </QuoteColumn>
                ))}
              </div>
              <p className="mt-3 text-xs text-text-muted">{tr('dealerOfferNote')}</p>
              <p className="mt-1 text-xs text-text-muted">{tr('illustrativeDisclaimer')}</p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
