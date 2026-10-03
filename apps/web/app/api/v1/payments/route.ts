import type { PaymentRequest } from '@sahel/domain';
import { handleError, ok, payments, problem } from '@/lib/api';

/** POST /api/v1/payments: create a charge (sandbox). Idempotency-Key header or body field required. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<PaymentRequest>;
    const idempotencyKey = req.headers.get('Idempotency-Key') ?? body.idempotencyKey;
    if (!idempotencyKey) return problem(400, 'BAD_REQUEST', 'Idempotency-Key is required');
    const payment = await payments.createCharge({ ...(body as PaymentRequest), idempotencyKey });
    return ok(payment, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
