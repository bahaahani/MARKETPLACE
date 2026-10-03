import { demoCustomer } from '@sahel/domain';
import { ok } from '@/lib/api';

/** Demo customer until eKey login and core-lending integration exist. */
export function GET() {
  return ok(demoCustomer());
}
