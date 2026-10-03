import { cardIssuer, ok } from '@/lib/api';
import { withCustomer } from '@/lib/session';

// Reads the in-memory sandbox store, so never cache.
export const dynamic = 'force-dynamic';

/** GET /api/v1/me/cards: virtual cards issued to this customer (masked numbers only). */
export function GET(req: Request) {
  return withCustomer(req, (s) => {
    const items = cardIssuer.list(s.customerId);
    return ok({ items, total: items.length });
  });
}
