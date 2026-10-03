import { cardIssuer, ok } from '@/lib/api';

// Reads the in-memory sandbox store, so never cache.
export const dynamic = 'force-dynamic';

/** GET /api/v1/me/cards: virtual cards issued in this sandbox session (masked numbers only). */
export function GET() {
  const items = cardIssuer.list();
  return ok({ items, total: items.length });
}
