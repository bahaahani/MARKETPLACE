import { PaymentNotFoundError } from '@sahel/domain';
import { contractSettings, handleBundlesError, ok, payments } from '@/lib/api';
import { withCustomer } from '@/lib/session';

/**
 * Sandbox stand-in for "customer completed the Tap flow and our webhook verified it".
 * Only the session that created the payment can confirm it: anyone else's (or an unknown) payment is 404.
 * An `early_settlement` payment is checked against the session customer's contract and current settlement quote
 * BEFORE it is captured (a wrong amount captures nothing), and once CAPTURED it marks the contract settled.
 */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withCustomer(
    req,
    async (s) => {
      const { id } = await ctx.params;
      const payment = payments.get(id, s.customerId);
      if (!payment) throw new PaymentNotFoundError(id);
      if (payment.purpose === 'early_settlement') contractSettings.verifySettlementPayment(s.customer, payment);
      const captured = await payments.confirm(id, s.customerId);
      if (captured.purpose === 'early_settlement') contractSettings.settle(s.customer, captured);
      return ok(captured);
    },
    handleBundlesError,
  );
}
