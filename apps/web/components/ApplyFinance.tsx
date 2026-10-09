'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ORIGINATION_STRUCTURES, type BidExtra, type FinanceStructure, type Localized, type OriginationStructure } from '@sahel/domain';
import { t, type AppLocale, type MessageKey } from '@sahel/i18n';

/** What the finance calculator currently shows, so "Apply for finance" applies for exactly that. */
export interface FinanceSelection {
  structure: FinanceStructure;
  downPaymentFils: number;
  tenureMonths: number;
}

/**
 * The customer's accepted "Bid For Me" bid for this car, as GET /api/v1/requests/{id} shows it (the car page reads
 * `requestId` and `bidId` from the link). The server prices the application from the bid again when they apply.
 */
export interface AcceptedBidContext {
  requestId: string;
  bidId: string;
  sellerName: Localized;
  listPriceFils: number;
  discountFils: number;
  priceFils: number;
  extras: BidExtra[];
  validUntil: string;
}

interface CarContext {
  selection: FinanceSelection | null;
  setSelection: (s: FinanceSelection) => void;
  bid: AcceptedBidContext | null;
  setBid: (b: AcceptedBidContext | null) => void;
  /** "Use my trade-in" was pressed: applying counts the customer's active offer in the down payment */
  useTradeIn: boolean;
  setUseTradeIn: (v: boolean) => void;
}

const SelectionContext = createContext<CarContext | null>(null);

export function FinanceSelectionProvider({ children }: { children: React.ReactNode }) {
  const [selection, setSelection] = useState<FinanceSelection | null>(null);
  const [bid, setBid] = useState<AcceptedBidContext | null>(null);
  const [useTradeIn, setUseTradeIn] = useState(false);
  const value = useMemo(() => ({ selection, setSelection, bid, setBid, useTradeIn, setUseTradeIn }), [selection, bid, useTradeIn]);
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

/** The accepted bid this car page applies with (null without one, or outside a FinanceSelectionProvider). */
export function useAcceptedBid(): AcceptedBidContext | null {
  return useContext(SelectionContext)?.bid ?? null;
}

export function useSetAcceptedBid() {
  return useContext(SelectionContext)?.setBid;
}

export function useTradeInChoice() {
  const c = useContext(SelectionContext);
  return { useTradeIn: c?.useTradeIn ?? false, setUseTradeIn: c?.setUseTradeIn };
}

/** Used by FinanceCalculator to publish its selection (no-op outside a provider). */
export function useSetFinanceSelection() {
  return useContext(SelectionContext)?.setSelection;
}

export type ApplicationBody =
  | {
      productLine: 'vehicle';
      structure: OriginationStructure;
      vehicleId: string;
      downPaymentFils: number;
      tenureMonths: number;
      /** The accepted bid to price from and the trade-in to count: only named here, the server decides the numbers */
      requestId?: string;
      bidId?: string;
      useTradeIn?: boolean;
    }
  | { productLine: 'personal'; structure: OriginationStructure; amountFils: number; tenureMonths: number }
  | { productLine: 'home'; structure: OriginationStructure; propertyId: string; downPaymentFils: number; tenureMonths: number };

/**
 * Submits POST /api/v1/applications (the same API the Flutter app uses) and opens the application page.
 * One idempotency key per set of terms, so a double click never creates two applications.
 */
export function ApplyButton({
  locale,
  body,
  className = 'btn btn-primary',
  label = 'applyFinance',
}: {
  locale: AppLocale;
  body: ApplicationBody | null;
  className?: string;
  label?: MessageKey;
}) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'busy' | 'error' | 'bid' | 'tradeIn'>('idle');
  const termsKey = JSON.stringify(body);
  const idempotencyKey = useMemo(() => (termsKey ? crypto.randomUUID() : ''), [termsKey]);

  async function apply() {
    if (!body) return;
    setState('busy');
    try {
      const res = await fetch('/api/v1/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        // A bid or trade-in the server refuses says so (BID_*, NO_TRADE_IN, TRADE_IN_*); anything else is generic.
        const code = ((await res.json().catch(() => null)) as { error?: { code?: string } } | null)?.error?.code ?? '';
        setState(code.startsWith('BID_') ? 'bid' : code.includes('TRADE_IN') ? 'tradeIn' : 'error');
        return;
      }
      const { data } = (await res.json()) as { data: { id: string } };
      router.push(`/${locale}/applications/${data.id}`);
    } catch {
      setState('error');
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={apply} disabled={!body || state === 'busy'} data-testid="apply-finance">
        {t(locale, label)}
      </button>
      {state === 'error' && <p className="w-full text-sm text-danger">{t(locale, 'errorGeneric')}</p>}
      {state === 'bid' && <p className="w-full text-sm text-danger" data-testid="apply-error-bid">{t(locale, 'carryErrorBid')}</p>}
      {state === 'tradeIn' && <p className="w-full text-sm text-danger" data-testid="apply-error-tradein">{t(locale, 'carryErrorTradeIn')}</p>}
    </>
  );
}

/**
 * "Apply for finance" on the car page, carrying the calculator's structure, down payment and tenure, plus the accepted
 * bid (requestId, bidId) and "Use my trade-in" when the customer chose them. The price is never sent: the server
 * prices from the bid and the offer.
 */
export function CarApplyButton({ locale, vehicleId }: { locale: AppLocale; vehicleId: string }) {
  const ctx = useContext(SelectionContext);
  const selection = ctx?.selection ?? null;
  const bid = ctx?.bid ?? null;
  const structure = ORIGINATION_STRUCTURES.find((s) => s === selection?.structure);
  const body: ApplicationBody | null =
    selection && structure
      ? {
          productLine: 'vehicle',
          structure,
          vehicleId,
          downPaymentFils: selection.downPaymentFils,
          tenureMonths: selection.tenureMonths,
          ...(bid ? { requestId: bid.requestId, bidId: bid.bidId } : {}),
          ...(ctx?.useTradeIn ? { useTradeIn: true } : {}),
        }
      : null;
  return <ApplyButton locale={locale} body={body} className="btn btn-ghost" />;
}

/** The calculator's current selection (null until it has published one, or outside a FinanceSelectionProvider). */
export function useFinanceSelection(): FinanceSelection | null {
  return useContext(SelectionContext)?.selection ?? null;
}
