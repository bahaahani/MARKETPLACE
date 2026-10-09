'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { formatBhd, type BidRequestView } from '@sahel/domain';
import { t, type AppLocale, type MessageKey } from '@sahel/i18n';
import { bahrainDateTimeText, BID_EXTRA_LABEL } from '@/lib/bids-labels';
import { useSetAcceptedBid, useAcceptedBid } from './ApplyFinance';

/**
 * The accepted "Bid For Me" bid on a car page. "Apply for finance on this car" (on the request page) links here with
 * `?requestId=&bidId=`. The bid is read from GET /api/v1/requests/{id} (the customer's own request) and shown with its
 * discount and extras, and the finance calculator and Apply use its price. Nothing is trusted here: POST
 * /api/v1/applications checks the bid again and prices the application itself.
 */
export function AcceptedBidBanner({ locale, vehicleId }: { locale: AppLocale; vehicleId: string }) {
  const params = useSearchParams();
  const requestId = params.get('requestId');
  const bidId = params.get('bidId');
  const setBid = useSetAcceptedBid();
  const bid = useAcceptedBid();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!requestId || !bidId) return;
    let cancelled = false;
    fetch(`/api/v1/requests/${encodeURIComponent(requestId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ data: BidRequestView }>) : null))
      .then((j) => {
        if (cancelled) return;
        const view = j?.data;
        const b = view?.bids.find((x) => x.id === bidId);
        if (!view || !b || view.accepted?.bidId !== bidId || b.vehicle.id !== vehicleId) {
          setFailed(true);
          return;
        }
        setBid?.({
          requestId,
          bidId,
          sellerName: b.seller.name,
          listPriceFils: b.pricing.listPriceFils,
          discountFils: b.pricing.discountFils,
          priceFils: b.pricing.priceFils,
          extras: b.extras,
          validUntil: view.accepted.validUntil,
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [requestId, bidId, vehicleId, setBid]);

  const tr = (k: MessageKey, v?: Record<string, string | number>) => t(locale, k, v);
  const money = (f: number) => formatBhd(f, locale, { decimals: 0 });
  if (requestId && bidId && failed) {
    return (
      <p className="rounded-[var(--radius-md)] border border-border bg-surface p-3 text-sm text-text-muted" data-testid="car-bid-unavailable">
        {tr('carryBidUnavailable')}
      </p>
    );
  }
  if (!bid) return null;
  return (
    <section className="card border-islamic p-4" data-testid="car-bid" aria-labelledby="car-bid-title">
      <h2 id="car-bid-title" className="font-bold text-islamic">
        ✓ {tr('carryBidTitle', { dealer: bid.sellerName[locale] })}
      </h2>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-text-muted">{tr('carryBidListPrice')}</dt>
          <dd className="whitespace-nowrap" data-testid="car-bid-list">{money(bid.listPriceFils)}</dd>
        </div>
        {bid.discountFils > 0 && (
          <div className="flex justify-between gap-2">
            <dt className="text-text-muted">{tr('carryBidDiscount')}</dt>
            <dd className="whitespace-nowrap text-islamic" data-testid="car-bid-discount">−{money(bid.discountFils)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-2 font-bold">
          <dt>{tr('carryBidPrice')}</dt>
          <dd className="whitespace-nowrap" data-testid="car-bid-price">{money(bid.priceFils)}</dd>
        </div>
      </dl>
      {bid.extras.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-text-muted">{tr('carryBidExtras')}</p>
          <ul className="mt-1 flex flex-wrap gap-1 text-xs" data-testid="car-bid-extras">
            {bid.extras.map((x) => (
              <li key={x} className="rounded-full bg-islamic-soft px-2 py-0.5 text-islamic">{tr(BID_EXTRA_LABEL[x])}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2 text-xs text-text-muted">{tr('carryBidValidUntil', { date: bahrainDateTimeText(locale, bid.validUntil) })}</p>
      <p className="text-xs text-text-muted">{tr('carryBidApplyNote')}</p>
    </section>
  );
}
