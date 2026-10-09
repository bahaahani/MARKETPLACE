import { CARRY_ERROR_STATUS, CarryError, type CarryContext } from '@sahel/domain';
import { handleError, problem } from '@/lib/api';
import { bidStore } from '@/lib/bids-store';
import { tradeInStore } from '@/lib/tradein-store';

/**
 * Connects the bid and trade-in sandbox stores to the domain's resolveVehicleCarry (a won bid and the trade-in
 * offer carried into a vehicle finance application). Both stores are scoped to the session customer.
 */
export function carryContext(customerId: string): CarryContext {
  return { customerId, bids: bidStore, tradeIns: tradeInStore };
}

/** handleError plus CarryError (BID_NOT_ACCEPTED, BID_VEHICLE_MISMATCH, TRADE_IN_EXPIRED, ...), matched by name too. */
export function handleCarryError(e: unknown) {
  if (e instanceof CarryError || (e instanceof Error && e.name === 'CarryError')) {
    const code = (e as CarryError).code;
    return problem(CARRY_ERROR_STATUS[code] ?? 422, code, e.message);
  }
  return handleError(e);
}
