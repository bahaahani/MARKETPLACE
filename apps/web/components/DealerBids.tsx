'use client';

import { useState, type FormEvent } from 'react';
import { BID_EXTRAS, formatBhd, NUMBER_LOCALE, type BidExtra, type DealerRequestView } from '@sahel/domain';
import { t, type AppLocale, type MessageKey } from '@sahel/i18n';
import { bahrainDateTimeText, BID_BODY_LABEL, BID_CONDITION_LABEL, BID_ERROR_LABEL, BID_EXTRA_LABEL, BID_FUEL_LABEL, BID_INSURANCE_LABEL } from '@/lib/bids-labels';
import { STRUCTURE_LABEL } from '@/lib/labels';

/**
 * One open "Bid For Me" request in the dealer portal, with the bid form: a car from this dealer's matching stock, an
 * optional discount (capped per car) and extras from the fixed list. The server prices the monthly on the customer's
 * terms (POST /api/v1/dealer/{sellerId}/requests/{id}/bids) and rejects a bid above the customer's maximum.
 */
export function DealerRequestCard({ locale, sellerId, initial }: { locale: AppLocale; sellerId: string; initial: DealerRequestView }) {
  const tr = (k: MessageKey, v?: Record<string, string | number>) => t(locale, k, v);
  const money = (f: number, d: 0 | 3 = 3) => formatBhd(f, locale, { decimals: d });
  const num = (n: number) => new Intl.NumberFormat(NUMBER_LOCALE[locale]).format(n);
  const [view, setView] = useState(initial);
  const firstVehicle = view.myBid?.vehicle.id ?? view.matchingVehicles.find((m) => m.withinBudget)?.vehicle.id ?? view.matchingVehicles[0]?.vehicle.id ?? '';
  const [vehicleId, setVehicleId] = useState(firstVehicle);
  const [discountBhd, setDiscountBhd] = useState(view.myBid ? String(view.myBid.pricing.discountFils / 1000) : '0');
  const [extras, setExtras] = useState<BidExtra[]>(view.myBid?.extras ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const selected = view.matchingVehicles.find((m) => m.vehicle.id === vehicleId);
  const c = view.criteria;
  const criteria = [
    tr(BID_BODY_LABEL[c.bodyType]),
    tr(BID_CONDITION_LABEL[c.condition]),
    ...(c.minYear !== null ? [`${tr('bidMinYear')} ${c.minYear}`] : []),
    ...(c.maxMileageKm !== null ? [`${tr('bidMaxMileage')} ${tr('km', { value: num(c.maxMileageKm) })}`] : []),
    ...(c.fuel !== 'any' ? [tr(BID_FUEL_LABEL[c.fuel])] : []),
    ...(c.minSeats !== null ? [tr('bidSeatsAtLeast', { value: c.minSeats })] : []),
    tr(BID_INSURANCE_LABEL[view.terms.insurance]),
  ];

  function toggleExtra(x: BidExtra) {
    setExtras((all) => {
      if (all.includes(x)) return all.filter((e) => e !== x);
      // One free-service plan at most: picking one replaces the other.
      const kept = x.startsWith('service-') ? all.filter((e) => !e.startsWith('service-')) : all;
      return [...kept, x];
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      const res = await fetch(`/api/v1/dealer/${sellerId}/requests/${view.id}/bids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId, discountFils: Math.round(Number(discountBhd || '0') * 1000), extras }),
      });
      const json = (await res.json()) as { data?: DealerRequestView | null; error?: { code?: string } };
      if (!res.ok || !json.data) throw json.error ?? {};
      setView(json.data);
      setSent(true);
    } catch (err) {
      setError(tr(BID_ERROR_LABEL[(err as { code?: string }).code ?? ''] ?? 'errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="card space-y-3 p-5" data-testid="dealer-request" data-request-id={view.id}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-text-muted">{tr('bidDealerCustomer', { name: view.firstName[locale] })}</p>
          <p className="text-lg font-bold">{tr('bidSummaryMonthly', { amount: money(view.terms.maxMonthlyFils, 0) })}</p>
          <p className="text-sm">
            {tr('bidDealerTerms', {
              structure: tr(STRUCTURE_LABEL[view.terms.structure]),
              months: view.terms.tenureMonths,
              down: money(view.terms.downPaymentFils, 0),
            })}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${view.preApproved ? 'bg-islamic-soft text-islamic' : 'bg-background text-text-muted'}`}
          data-testid="dealer-request-preapproved"
        >
          {tr(view.preApproved ? 'bidDealerPreApproved' : 'bidDealerNotPreApproved')}
        </span>
      </div>
      <ul className="flex flex-wrap gap-1 text-xs">
        {criteria.map((x) => (
          <li key={x} className="rounded-full bg-background px-2 py-0.5">{x}</li>
        ))}
      </ul>
      <p className="text-xs text-text-muted">
        {tr('bidExpiresAt', { time: bahrainDateTimeText(locale, view.expiresAt) })} · {tr('bidDealerBidCount', { count: num(view.bidCount) })}
      </p>

      {view.myBid && (
        <p className="rounded-lg bg-brand-soft p-2 text-sm text-brand" data-testid="dealer-my-bid" data-bid-id={view.myBid.id}>
          {tr('bidDealerYourBid', { vehicle: view.myBid.vehicle.title, amount: money(view.myBid.pricing.monthlyFils) })}
        </p>
      )}

      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">{tr('bidDealerVehicle')}</span>
          <select className="w-full rounded-lg border border-border bg-surface p-2" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} data-testid="dealer-bid-vehicle">
            {view.matchingVehicles.map((m) => (
              <option key={m.vehicle.id} value={m.vehicle.id}>
                {m.vehicle.title}
                {m.listPricing ? ` · ${tr('bidMonthly', { amount: money(m.listPricing.monthlyFils) })}` : ''}
              </option>
            ))}
          </select>
          {selected && (
            <span className={`mt-1 block text-xs ${selected.withinBudget ? 'text-islamic' : 'text-[#8a5c00]'}`} data-testid="dealer-bid-fit">
              {tr(selected.withinBudget ? 'bidDealerWithinBudget' : 'bidDealerOverBudget')}
            </span>
          )}
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium">{tr('bidDealerDiscount')}</span>
          <input
            className="w-full rounded-lg border border-border bg-surface p-2"
            type="number"
            inputMode="numeric"
            min={0}
            max={selected ? selected.maxDiscountFils / 1000 : undefined}
            step={1}
            value={discountBhd}
            onChange={(e) => setDiscountBhd(e.target.value)}
            data-testid="dealer-bid-discount"
          />
          {selected && <span className="mt-1 block text-xs text-text-muted">{tr('bidDealerMaxDiscount', { amount: money(selected.maxDiscountFils, 0) })}</span>}
        </label>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-sm font-medium">{tr('bidExtras')}</legend>
          <div className="flex flex-wrap gap-2">
            {BID_EXTRAS.map((x) => (
              <label key={x} className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs">
                <input type="checkbox" checked={extras.includes(x)} onChange={() => toggleExtra(x)} data-testid={`dealer-bid-extra-${x}`} />
                {tr(BID_EXTRA_LABEL[x])}
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <p className="text-sm text-danger sm:col-span-2" role="alert" data-testid="dealer-bid-error">
            {error}
          </p>
        )}
        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" className="btn btn-primary" disabled={busy || !vehicleId} data-testid="dealer-bid-submit">
            {tr(view.myBid ? 'bidDealerUpdate' : 'bidDealerSubmit')}
          </button>
          {sent && <span className="text-sm font-semibold text-islamic" role="status" data-testid="dealer-bid-sent">✓ {tr('bidDealerSent')}</span>}
        </div>
      </form>
    </li>
  );
}
