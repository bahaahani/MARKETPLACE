import { LIFE_EVENTS } from '@sahel/domain';
import { ok } from '@/lib/api';

/** GET /api/v1/life-events: the curated life events (Life-Event Engine). */
export function GET() {
  return ok({ items: LIFE_EVENTS, total: LIFE_EVENTS.length });
}
