import { assertServerAmount, validatePaymentRequest, type PaymentRequest } from '@sahel/domain';
import { jsonBody, ok, payments, problem } from '@/lib/api';
import { handlePaymentAmountError } from '@/lib/home-finance';
import { withCustomer } from '@/lib/session';

/**
 * POST /api/v1/payments: create a charge (sandbox). Idempotency-Key header or body field required;
 * keys are scoped to the customer session.
 * Server-priced purposes (reservation_deposit, valuation_fee) must carry the server amount
 * (GET /api/v1/payments/price); any other amount is 422 AMOUNT_MISMATCH and no charge is created.
 */
export function POST(req: Request) {
  return withCustomer(
    req,
    async (s) => {
      const body = await jsonBody<Partial<PaymentRequest>>(req);
      const idempotencyKey = req.headers.get('Idempotency-Key') ?? body.idempotencyKey;
      if (!idempotencyKey || typeof idempotencyKey !== 'string') return problem(400, 'BAD_REQUEST', 'Idempotency-Key is required');
      const request = { ...(body as PaymentRequest), idempotencyKey };
      validatePaymentRequest(request);
      assertServerAmount(request);
      const payment = await payments.createCharge(request, s.customerId);
      return ok(payment, { status: 201 });
    },
    handlePaymentAmountError,
  );
}
