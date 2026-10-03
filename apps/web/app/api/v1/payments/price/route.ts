import { serverPaymentPrice } from '@sahel/domain';
import { ok } from '@/lib/api';
import { handlePaymentAmountError } from '@/lib/home-finance';
import { withCustomer } from '@/lib/session';

// Reads the query and the customer session, so never cache.
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/payments/price?purpose=&reference=: the amount the server will accept for a server-priced payment
 * (reservation_deposit for a catalog car, valuation_fee for a property for sale). Checkout pages on web and mobile
 * show and pay this amount; POST /payments refuses any other (422 AMOUNT_MISMATCH).
 */
export function GET(req: Request) {
  return withCustomer(
    req,
    () => {
      const q = new URL(req.url).searchParams;
      return ok(serverPaymentPrice(q.get('purpose'), q.get('reference')));
    },
    handlePaymentAmountError,
  );
}
