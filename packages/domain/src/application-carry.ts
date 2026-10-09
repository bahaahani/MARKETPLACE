import type { Fils } from './money';
import { bidAcceptedUntil, maxBidDiscount, type BidExtra, type BidRequest } from './bids';
import { findVehicle } from './catalog';
import type { ApplicationSource, ApplicationTradeIn } from './origination';
import { tradeInDownPayment, type TradeInOffer } from './tradein';

/**
 * Carrying a won "Bid For Me" bid and the customer's trade-in offer into a vehicle finance application.
 *
 * The client only names them (`requestId` + `bidId`, `useTradeIn: true`). Everything that changes the price is read
 * here, on the server, from the customer's own stores: the discounted price comes from the accepted bid, the credit
 * from the active offer. A forged bid id, another customer's request, a bid that was not the accepted one, a bid for
 * another car (or a car whose price changed) and an expired offer are all refused with a clear code. Without either,
 * the result is the plain list price and the customer's own down payment, exactly as before.
 *
 * ⚠️ Sandbox: the trade-in is credited at delivery (no valuation re-check, no vehicle inspection), and an offer is not
 * consumed by an application.
 */

export type CarryErrorCode =
  | 'INVALID_REQUEST'
  | 'BID_NOT_FOUND'
  | 'BID_NOT_ACCEPTED'
  | 'BID_VEHICLE_MISMATCH'
  | 'BID_EXPIRED'
  | 'NO_TRADE_IN'
  | 'TRADE_IN_EXPIRED'
  | 'TRADE_IN_MISMATCH';

export const CARRY_ERROR_STATUS: Record<CarryErrorCode, number> = {
  INVALID_REQUEST: 422,
  BID_NOT_FOUND: 404,
  BID_NOT_ACCEPTED: 409,
  BID_VEHICLE_MISMATCH: 422,
  BID_EXPIRED: 410,
  NO_TRADE_IN: 422,
  TRADE_IN_EXPIRED: 410,
  TRADE_IN_MISMATCH: 422,
};

export class CarryError extends Error {
  constructor(
    public readonly code: CarryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CarryError';
  }
}

export interface CarryInput {
  vehicleId: string;
  /** The customer's chosen down payment: the whole of it, trade-in included (as the calculator shows it) */
  downPaymentFils: Fils;
  /** The accepted bid to price from (both ids, unknown input from the API) */
  requestId?: unknown;
  bidId?: unknown;
  /** Use the customer's active trade-in offer (unknown input from the API) */
  useTradeIn?: unknown;
  /** Optional: must be the customer's active offer id */
  tradeInOfferId?: unknown;
}

export interface CarryContext {
  customerId: string;
  /** The bid store: another customer's request reads as undefined */
  bids: { get(id: string, customerId: string): BidRequest | undefined };
  /** The trade-in store: the customer's latest offer, active or not */
  tradeIns: { latest(customerId: string): { offer: TradeInOffer; active: boolean } | undefined };
  now?: Date;
}

export interface VehicleCarry {
  /** What the quote finances: the list price, or the bid's discounted price */
  assetPriceFils: Fils;
  /** Total down payment for the quote: the customer's, at least the trade-in credit */
  downPaymentFils: Fils;
  source?: ApplicationSource;
  /** Catalogue price, only with a bid */
  listPriceFils?: Fils;
  extras?: BidExtra[];
  tradeIn?: ApplicationTradeIn;
}

/**
 * Resolves the price and down payment of a vehicle application. Throws CarryError. The vehicle must exist in the
 * catalogue.
 */
export function resolveVehicleCarry(input: CarryInput, ctx: CarryContext): VehicleCarry {
  const v = findVehicle(input.vehicleId);
  if (!v) throw new CarryError('INVALID_REQUEST', `unknown vehicle ${input.vehicleId}`);
  const now = ctx.now ?? new Date();
  const hasBid = input.requestId !== undefined || input.bidId !== undefined;
  if (input.useTradeIn !== undefined && typeof input.useTradeIn !== 'boolean') throw new CarryError('INVALID_REQUEST', 'useTradeIn must be a boolean');
  const useTradeIn = input.useTradeIn === true;

  let assetPriceFils = v.priceFils;
  let source: ApplicationSource | undefined;
  let listPriceFils: Fils | undefined;
  let extras: BidExtra[] | undefined;

  if (hasBid) {
    const { requestId, bidId } = input;
    if (typeof requestId !== 'string' || !requestId || typeof bidId !== 'string' || !bidId) {
      throw new CarryError('INVALID_REQUEST', 'requestId and bidId must both be given as text');
    }
    const request = ctx.bids.get(requestId, ctx.customerId);
    const bid = request?.bids.find((b) => b.id === bidId);
    if (!request || !bid) throw new CarryError('BID_NOT_FOUND', 'no such accepted bid on your requests');
    if (request.status !== 'CLOSED' || request.acceptedBidId !== bid.id || bid.status !== 'ACCEPTED') {
      throw new CarryError('BID_NOT_ACCEPTED', 'this bid was not accepted: accept it on the request first');
    }
    if (bid.vehicle.id !== v.id) throw new CarryError('BID_VEHICLE_MISMATCH', `this bid is for ${bid.vehicle.title}, not for this car`);
    const { discountFils } = bid.pricing;
    // The price may have changed since the bid, or the cap: the bid then no longer applies to this car.
    if (bid.pricing.listPriceFils !== v.priceFils || !Number.isSafeInteger(discountFils) || discountFils < 0 || discountFils > maxBidDiscount(v.priceFils)) {
      throw new CarryError('BID_VEHICLE_MISMATCH', 'the car price changed since this bid: ask the dealer for a new bid');
    }
    if (now.getTime() > Date.parse(bidAcceptedUntil(request))) throw new CarryError('BID_EXPIRED', 'the accepted bid has expired: its price is no longer held');
    assetPriceFils = v.priceFils - discountFils;
    source = { type: 'bid', requestId: request.id, bidId: bid.id };
    listPriceFils = v.priceFils;
    extras = [...bid.extras];
  }

  let downPaymentFils = input.downPaymentFils;
  let tradeIn: ApplicationTradeIn | undefined;
  if (useTradeIn) {
    const latest = ctx.tradeIns.latest(ctx.customerId);
    if (!latest) throw new CarryError('NO_TRADE_IN', 'there is no trade-in offer to use: value your car first');
    if (!latest.active) throw new CarryError('TRADE_IN_EXPIRED', 'your trade-in offer has expired: value your car again');
    if (input.tradeInOfferId !== undefined && input.tradeInOfferId !== latest.offer.id) {
      throw new CarryError('TRADE_IN_MISMATCH', 'that is not your active trade-in offer');
    }
    // Same rule as the calculator's "Use my trade-in": min(offer, maximum down payment) on the slider step, on the price
    // actually financed. The customer can add cash on top but cannot go below the credit.
    const use = tradeInDownPayment(latest.offer.offerFils, v.id, assetPriceFils);
    downPaymentFils = Math.max(input.downPaymentFils, use.downPaymentFils);
    tradeIn = { offerId: latest.offer.id, offerFils: latest.offer.offerFils, creditFils: use.creditedFils, capped: use.capped };
  }

  return {
    assetPriceFils,
    downPaymentFils,
    ...(source ? { source, listPriceFils, extras } : {}),
    ...(tradeIn ? { tradeIn } : {}),
  };
}
