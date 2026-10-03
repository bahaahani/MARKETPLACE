import { findVehicle, SandboxTradeInStore, TRADE_IN_ERROR_STATUS, tradeInDownPayment, TradeInError, type TradeInOffer } from '@sahel/domain';
import { NextResponse } from 'next/server';
import { handleError, problem } from '@/lib/api';

const g = globalThis as unknown as { __sahelTradeIns?: SandboxTradeInStore };

/**
 * ⚠️ Sandbox trade-in offers (in memory, lost on restart): one active offer per session customer (lib/session.ts).
 * Valuations come from the deterministic rules model in @sahel/domain (not AI).
 */
export const tradeInStore = (g.__sahelTradeIns ??= new SandboxTradeInStore());

/** GET /me/trade-in body: the active offer (or null) and, for `vehicleId`, the down payment it gives that car. */
export function tradeInView(offer: TradeInOffer | undefined, vehicleId: string | null) {
  if (vehicleId === null) return { offer: offer ?? null };
  const v = findVehicle(vehicleId);
  if (!v) return undefined;
  return { offer: offer ?? null, forVehicle: offer ? tradeInDownPayment(offer.offerFils, v.id, v.priceFils) : null };
}

/**
 * handleError plus TradeInError, whose body also carries `suggestions` (close makes or models). Matched by name too:
 * the store lives on globalThis and may have been created by another route's bundle.
 */
export function handleTradeInError(e: unknown) {
  if (e instanceof TradeInError || (e instanceof Error && e.name === 'TradeInError')) {
    const err = e as TradeInError;
    const status = TRADE_IN_ERROR_STATUS[err.code] ?? 422;
    if (!err.suggestions?.length) return problem(status, err.code, err.message);
    return NextResponse.json({ error: { code: err.code, message: err.message, suggestions: err.suggestions } }, { status });
  }
  return handleError(e);
}
