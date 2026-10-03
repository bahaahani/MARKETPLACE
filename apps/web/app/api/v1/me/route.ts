import { currentCustomer, ok } from '@/lib/api';

// Includes this session's contract settings (autopay), so never cache.
export const dynamic = 'force-dynamic';

/** Demo customer until eKey login and core-lending integration exist. */
export function GET() {
  return ok(currentCustomer());
}
