import { CARDS } from '@sahel/domain';
import { ok } from '@/lib/api';

export function GET() {
  return ok({ items: CARDS, total: CARDS.length });
}
